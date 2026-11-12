// Isolated dependency-packaging candidate. Does not modify or load the running module.
import{readFile,writeFile,readdir,mkdir,link,access,rm,rename,stat,lstat,copyFile}from'node:fs/promises';import{join,dirname}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';
const run=promisify(execFile),prod='C:/Users/Admin/.dsh/plugins-data/aurabot/modules/meme',stage='C:/Users/Admin/.dsh/plugins-data/aurabot/modules-data/meme-lean-stage';
const exists=p=>access(p).then(()=>true,()=>false);
async function links(src,dst,filter=()=>true,rel=''){await mkdir(dst,{recursive:true});for(const e of await readdir(src,{withFileTypes:true})){const r=rel?rel+'/'+e.name:e.name;if(!filter(r,e))continue;const a=join(src,e.name),b=join(dst,e.name);if(e.isDirectory())await links(a,b,filter,r);else if(e.isFile()&&!await exists(b))await link(a,b);}}
await mkdir(stage,{recursive:true});
for(const entry of await readdir(prod,{withFileTypes:true}))if(entry.isFile())await copyFile(join(prod,entry.name),join(stage,entry.name));
await links(join(prod,'lib'),join(stage,'lib'));await links(join(prod,'scripts'),join(stage,'scripts'));
for(const entry of ['@memecrafters','@resvg'])await links(join(prod,'node_modules',entry),join(stage,'node_modules',entry));
// config/ready files are copied, never hard-linked, because the engine writes configuration.
const oldNative=join(prod,'node_modules/.meme-runtime'),native=join(stage,'node_modules/.meme-runtime');
for(const entry of ['resources','libraries'])await links(join(oldNative,entry),join(native,entry));
for(const entry of ['config.toml','ready.json'])await copyFile(join(oldNative,entry),join(native,entry));
const old=join(prod,'node_modules/.meme-python'),home=join(stage,'node_modules/.meme-python');
await links(join(old,'source'),join(home,'source'));
await links(join(old,'site-packages'),join(home,'site-packages'),r=>!['cv2','opencv_python_headless-4.11.0.86.dist-info','pybind11','pybind11-3.0.1.dist-info'].some(x=>r===x||r.startsWith(x+'/')));
const runtime=JSON.parse(await readFile(join(old,'runtime.json'),'utf8')),interpreter=dirname(runtime.executable);
await links(join(old,interpreter),join(home,interpreter),r=>!['include','libs','tcl','Lib'].some(x=>r===x||r.startsWith(x+'/'))&&!/^(?:DLLs\/)?(?:_tkinter\.pyd|tcl\d+t?\.dll|tk\d+t?\.dll)$/i.test(r));
for(const name of ['runtime.json','ready.json','catalog.json','excluded.json','active-directories.json','skipped-directories.json','requirements.txt'])if(await exists(join(old,name)))await copyFile(join(old,name),join(home,name));
// One upstream helper is changed to lazy imports for three unused optional OpenCV filters.
const target=join(home,'site-packages/pil_utils/build_image.py');const lines=(await readFile(join(old,'site-packages/pil_utils/build_image.py'),'utf8')).split(/\r?\n/);
const patch=JSON.parse(await readFile('//wsl.localhost/Ubuntu/root/dsh-aurabot-qq-meme-plugin/native-work/lazy-cv2.json','utf8'));
for(const p of [...patch.patches].sort((a,b)=>b.line-a.line))lines.splice(p.line,0,p.text);
const content=lines.map(line=>line==='import cv2'?'# Optional OpenCV filters import their dependency on demand.':line).join('\n');
await writeFile(target+'.new',content);await rename(target+'.new',target); // break the hard link before changing bytes
// The CPython standard library uses its supported python312.zip path; no interpreter changes.
const zip=join(home,interpreter,'python312.zip');
const packCode='import pathlib,sys,zipfile\nsrc=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])\nwith zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for p in src.rglob("*"):\n  r=p.relative_to(src)\n  if p.is_file() and p.suffix==".py" and not any(x in r.parts for x in ("test","tests","tkinter","idlelib","ensurepip","site-packages","__pycache__")):\n   z.write(p,r.as_posix())\n';
await run(join(old,runtime.executable),['-c',packCode,join(old,interpreter,'Lib'),zip],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
let fontSavings=0;const nativeFonts=join(native,'resources/fonts'),pyFonts=join(home,'source/resources/fonts'),bySize=new Map();
for(const n of await readdir(nativeFonts)){const p=join(nativeFonts,n),s=await stat(p);if(s.isFile()){const a=bySize.get(s.size)||[];a.push(p);bySize.set(s.size,a);}}
for(const n of await readdir(pyFonts)){const p=join(pyFonts,n),s=await stat(p);for(const other of bySize.get(s.size)||[])if((await readFile(p)).equals(await readFile(other))){await rm(p);await link(other,p);fontSavings+=s.size;break;}}
await run(join(home,runtime.executable),['-u',join(stage,'lib/python-worker.py'),'--catalog'],{windowsHide:true,maxBuffer:4*1024*1024,env:{...process.env,MEME_PYTHON_HOME:home,MEME_MODULE_DIR:stage,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
let logicalBytes=0;async function count(p){for(const e of await readdir(p,{withFileTypes:true})){const a=join(p,e.name);if(e.isDirectory())await count(a);else if(e.isFile())logicalBytes+=(await stat(a)).size;}}await count(home);
const report={stage,catalog:JSON.parse(await readFile(join(home,'catalog.json'),'utf8')).length,pythonLogicalBytes:logicalBytes,fontSharedBytes:fontSavings,pythonUniquePayloadBytes:logicalBytes-fontSavings,originalPythonBytes:653471376,templatesChanged:0,templateRenderTests:0,productionChanged:false};
await writeFile('//wsl.localhost/Ubuntu/root/dsh-aurabot-qq-meme-plugin/native-work/lean-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
