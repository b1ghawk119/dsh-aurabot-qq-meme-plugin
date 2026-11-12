// Build/install time only. Runtime never downloads code or template assets.
import { readFile, stat, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const valid = (home, f) => stat(join(home, f.path)).then(s => s.size === f.size, () => false);

// Extract only a pinned pack's resources; callers check that its paths are disjoint.
async function streamResources(home, pack) {
  await mkdir(home, { recursive: true });
  const download = spawn(curl, ['-fLsS', '--connect-timeout', '20', '--max-time', '1200', `https://codeload.github.com/${pack.repository}/tar.gz/${pack.revision}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
  const extract = spawn('tar', ['-xz', '--strip-components=1', '-C', home, `${pack.repository.split('/')[1]}-${pack.revision}/resources`], { windowsHide: true, stdio: ['pipe', 'ignore', 'inherit'] });
  const wait = child => new Promise((res, rej) => { child.on('error', rej); child.on('close', code => code === 0 ? res() : rej(new Error(`资源下载/解包退出 ${code}`))); });
  // Register both error handlers before piping (tar may exit early).
  const results = [wait(download), wait(extract)];
  extract.stdin.on('error', () => download.kill());
  download.stdout.pipe(extract.stdin);
  try { await Promise.all(results); } finally { download.kill(); extract.kill(); }
}

export async function prepare(root) {
  const inventory = JSON.parse(await readFile(new URL('./resources.json', import.meta.url), 'utf8'));
  const { baseKeys, packs } = JSON.parse(await readFile(new URL('./packs.json', import.meta.url), 'utf8'));
  const home = join(root, 'node_modules', '.meme-runtime');
  const keys = new Set(baseKeys), paths = new Set(inventory.files.map(f => f.path));
  const files = inventory.files.map(f => ({ ...f, url: `https://raw.githubusercontent.com/MemeCrafters/meme-generator-rs/v${inventory.version}/${f.path}` }));
  for (const pack of packs) {
    // Never load a library that could replace an existing template or resource.
    for (const key of pack.keys) { if (keys.has(key)) throw new Error(`扩展模板标识重复：${key}`); keys.add(key); }
    for (const f of pack.files) { if (paths.has(f.path)) throw new Error(`扩展资源路径重复：${f.path}`); paths.add(f.path); }
    const binary = pack.binaries[`${process.platform}-${process.arch}`];
    if (!binary) throw new Error(`扩展库不支持 ${process.platform}-${process.arch}`);
    let missing = 0;
    for (const f of pack.files) if (!await valid(home, f)) missing++;
    if (missing > 100) {
      console.log(`下载 ${pack.id} 完整资源（流式解包，不保留压缩包）`);
      try { await streamResources(home, pack); }
      catch (error) { console.warn(`${error.message}；继续补齐缺失资源`); }
    }
    files.push(...pack.files.map(f => ({ ...f, url: `https://raw.githubusercontent.com/${pack.repository}/${pack.revision}/${f.path}` })), binary);
  }
  const missing = [];
  for (const f of files) if (!await valid(home, f)) missing.push(f);
  let done = 0, next = 0; const errors = [];
  console.log(`离线资源：已有 ${files.length - missing.length}/${files.length}，补齐 ${missing.length} 个文件`);
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < missing.length) {
      const f = missing[next++], dest = join(home, f.path), temp = dest + '.part';
      await mkdir(dirname(dest), { recursive: true });
      try {
        await run(curl, ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--retry-all-errors', '--connect-timeout', '15', '--max-time', '180', '-o', temp, f.url], { windowsHide: true });
        if ((await stat(temp)).size !== f.size) throw new Error('下载大小不完整');
        await rename(temp, dest);
      } catch (e) { errors.push(f.path + ': ' + e.message); await rm(temp, { force: true }); }
      done++; if (done % 50 === 0 || done === missing.length) console.log(`资源补齐 ${done}/${missing.length}`);
    }
  }));
  if (errors.length) throw new Error(`有 ${errors.length} 个资源下载失败，重新运行会从缺失处继续：\n${errors.slice(0, 5).join('\n')}`);
  await writeFile(join(home, 'config.toml'), '[meme]\nload_external_memes = true\n[font]\nuse_local_fonts = false\n[encoder]\ngif_max_frames = 200\n');
  const ready = { version: inventory.version, baseKeys, packs: packs.map(({ id, release, keys }) => ({ id, release, keys })), files: files.map(({ path, size }) => ({ path, size })) };
  await writeFile(join(home, 'ready.json.part'), JSON.stringify(ready));
  await rename(join(home, 'ready.json.part'), join(home, 'ready.json'));
  console.log(`离线资源齐全：${keys.size} 个模板，${files.length} 个文件，${Math.round(files.reduce((n, f) => n + f.size, 0) / 1048576)} MiB`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare(resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url))));
