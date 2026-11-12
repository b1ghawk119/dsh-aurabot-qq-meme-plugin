import { prepareSkiaData } from './python-data.mjs';
import { readFile, writeFile, stat, mkdir, rm, rename, readdir, unlink } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile), curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const execute = (file, args, options={}) => new Promise((res,rej)=>{const p=spawn(file,args,{stdio:'inherit',windowsHide:true,...options});p.on('error',rej);p.on('exit',code=>code===0?res():rej(Error(`${file} 退出 ${code}`)));});
const exists = p => stat(p).then(()=>true,()=>false);
export async function preparePython(root) {
 const manifest=JSON.parse(await readFile(new URL('./python-pack.json',import.meta.url),'utf8'));
 const home=join(root,'node_modules','.meme-python'), source=join(home,'source'), toolDir=join(home,'tools');
 await mkdir(source,{recursive:true});await mkdir(toolDir,{recursive:true});
 const marker=join(home,'ready.json');
 if(await exists(marker)) {const ready=JSON.parse(await readFile(marker,'utf8'));if(ready.revision===manifest.revision && ready.platform===`${process.platform}-${process.arch}` && await exists(join(home,ready.executable)) && await exists(join(home,'catalog.json'))) {await prepareSkiaData(home, ready.platform);console.log('Python 扩展已准备');return;}}
 const files=manifest.files;
 let missing=0;for(const f of files)if(await stat(join(source,f.path)).then(s=>s.size!==f.size,()=>true))missing++;
 if(missing>100) {
  const list=join(home,'archive-files.txt'), exclusions=join(home,'archive-excludes.txt'), prefix=`meme-generator-${manifest.revision}/`;
  await writeFile(list,['meme_generator','resources/fonts','LICENSE','README.md','pyproject.toml','uv.lock'].map(p=>prefix+p).join('\n')+'\n');
  const suffixes=['png','jpg','jpeg','gif','webp','bmp','ttf','otf','mp4'];
  await writeFile(exclusions,manifest.excludedKeys.flatMap(key=>suffixes.map(ext=>`*/memes*/${key}/*.${ext}`)).join('\n')+'\n');
  console.log(`下载 Python 库，仅解包新增模板资源（${files.length} 个文件）`);
  const download=spawn(curl,['-fLsS','--connect-timeout','20','--max-time','1200',`https://codeload.github.com/${manifest.repository}/tar.gz/${manifest.revision}`],{windowsHide:true,stdio:['ignore','pipe','inherit']});
  const extract=spawn('tar',['-xz', ...(process.platform==='win32'?['--options','hdrcharset=UTF-8']:[]), '--strip-components=1','-C',source,'-X',exclusions,'-T',list],{windowsHide:true,stdio:['pipe','ignore','inherit']});
  const wait=p=>new Promise((res,rej)=>{p.on('error',rej);p.on('close',c=>c===0?res():rej(Error(`资源流退出 ${c}`)));});
  const pending=[wait(download),wait(extract)];extract.stdin.on('error',()=>download.kill());download.stdout.pipe(extract.stdin);
  try{await Promise.all(pending);}catch(e){console.warn(e.message+'，按清单补齐缺失项');}finally{download.kill();extract.kill();}
  await rm(list,{force:true});await rm(exclusions,{force:true});
 }
 const incomplete=[];for(const f of files)if(await stat(join(source,f.path)).then(s=>s.size!==f.size,()=>true))incomplete.push(f);
 console.log(`补齐 ${incomplete.length} 个资源文件`);
 let next=0;
 await Promise.all(Array.from({length:8},async()=>{while(next<incomplete.length){const f=incomplete[next++],dest=join(source,f.path);await mkdir(dirname(dest),{recursive:true});await run(curl,['-fLsS','--retry','2','--retry-all-errors','--connect-timeout','15','--max-time','120','-o',dest+'.part',`https://raw.githubusercontent.com/${manifest.repository}/${manifest.revision}/${f.path.split("/").map(encodeURIComponent).join("/")}`],{windowsHide:true});if((await stat(dest+'.part')).size!==f.size)throw Error('资源不完整：'+f.path);await rename(dest+'.part',dest);}}));
 const asset=manifest.uv[`${process.platform}-${process.arch}`];if(!asset)throw Error('此平台暂无 Python 扩展安装包');
 const uvDir=process.platform==='win32'?toolDir:join(toolDir,asset.name.replace(/\.tar\.gz$/,''));
 const uv=join(uvDir,process.platform==='win32'?'uv.exe':'uv');
 if(!await exists(uv)) {const archive=join(toolDir,asset.name);await run(curl,['-fLsS','--retry','2','--max-time','300','-o',archive,asset.browser_download_url],{windowsHide:true});await execute('tar',['-xf',archive,'-C',toolDir]);await rm(archive);}
 const env={...process.env,UV_PYTHON_INSTALL_DIR:join(home,'interpreter'),UV_CACHE_DIR:join(toolDir,'cache'),UV_NO_CACHE:'1',UV_PYTHON_INSTALL_BIN:'0'};
 await execute(uv,['python','install','3.12.12','--no-bin','--no-registry'],{env});
 const executable=(await run(uv,['python','find','--managed-python','3.12.12'],{env,windowsHide:true})).stdout.trim();
 const requirements=join(home,'requirements.txt');
 await run(uv,['export','--frozen','--no-dev','--no-emit-project','--no-hashes','--format','requirements-txt','--output-file',requirements],{cwd:source,env,windowsHide:true});
 await execute(uv,['pip','install','--python',executable,'--target',join(home,'site-packages'),'--only-binary',':all:','--index-url','https://pypi.org/simple','-r',requirements],{env});
 await prepareSkiaData(home, `${process.platform}-${process.arch}`);
 await writeFile(join(home,'excluded.json'),JSON.stringify(manifest.excludedKeys));
 const runtime={platform:`${process.platform}-${process.arch}`,revision:manifest.revision,executable:relative(home,executable),excluded:manifest.excludedKeys.length};
 await writeFile(join(home,'runtime.json'),JSON.stringify(runtime));
 await execute(executable,['-u',fileURLToPath(new URL('../lib/python-worker.py',import.meta.url)),'--catalog'],{env:{...env,MEME_PYTHON_HOME:home,MEME_MODULE_DIR:root,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
 const catalog=JSON.parse(await readFile(join(home,'catalog.json'),'utf8'));
 runtime.count=catalog.length;
 // The upstream loader has already resolved same-ID entries. Keep one set of assets.
 const active=new Set(JSON.parse(await readFile(join(home,'active-directories.json'),'utf8'))), skipped=[];
 const trim=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())await trim(p);else if(!/\.py$|LICENSE|NOTICE/i.test(entry.name))await rm(p,{force:true});}};
 const packageDir=join(source,'meme_generator');
 for(const family of await readdir(packageDir,{withFileTypes:true}))if(family.isDirectory()&&family.name.startsWith('memes')) {
  for(const entry of await readdir(join(packageDir,family.name),{withFileTypes:true}))if(entry.isDirectory()) {
   const key=family.name+'/'+entry.name;
   if(!active.has(key)){skipped.push(key);await trim(join(packageDir,family.name,entry.name));}
  }
 }
 await writeFile(join(home,'skipped-directories.json'),JSON.stringify(skipped));
 await writeFile(marker,JSON.stringify(runtime));
 // Keep installed files, not installer caches or archives.
 await rm(toolDir,{recursive:true,force:true});
 for(const entry of await readdir(join(home,'interpreter'),{withFileTypes:true}))if(entry.isSymbolicLink())await unlink(join(home,'interpreter',entry.name));
 console.log(`Python 扩展就绪：新增 ${catalog.length} 个模板`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await preparePython(resolve(process.argv[2]||fileURLToPath(new URL('..',import.meta.url))));
