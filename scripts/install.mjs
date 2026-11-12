import { cp, mkdir, access, rename, unlink, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepare } from './prepare.mjs';
import { preparePython } from './prepare-python.mjs';
const run = promisify(execFile), root = fileURLToPath(new URL('..', import.meta.url));
const suffix = ({ 'win32-x64': 'win32-x64-msvc', 'darwin-x64': 'darwin-x64', 'darwin-arm64': 'darwin-arm64', 'linux-x64': 'linux-x64-gnu', 'linux-arm64': 'linux-arm64-gnu' })[`${process.platform}-${process.arch}`];
if (!suffix) throw new Error('支持 Windows x64、macOS x64/arm64、Linux glibc x64/arm64');
const withExtension = process.argv.includes('--with-extension');
const target = resolve(process.argv.slice(2).find(x => x !== '--with-extension') || join(homedir(), '.dsh', 'plugins-data', 'aurabot', 'modules', 'meme'));
if (await access(target).then(() => true, () => false)) throw new Error(`目标已存在：${target}。安装器不会覆盖现有模块。`);
const stage = join(dirname(target), '_meme-install');
await mkdir(stage, { recursive: true });
for (const name of ['index.mjs', 'module.json', 'package.json', 'panel.js', 'lib', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'scripts']) await cp(join(root, name), join(stage, name), { recursive: true });
for (const [scope, name, version] of [['@memecrafters', 'meme-generator', '0.2.3'], ['@memecrafters', `meme-generator-${suffix}`, '0.2.3'], ['@resvg', 'resvg-wasm', '2.6.2']]) {
  const relative = join('node_modules', scope, name), dest = join(stage, relative);
  if (await access(join(root, relative)).then(() => true, () => false)) await cp(join(root, relative), dest, { recursive: true });
  else {
    await mkdir(dest, { recursive: true });
    const archive = join(stage, `${name}.tgz`);
    console.log(`安装 ${name} ${version}`);
    await run(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-fL', '--retry', '2', '--max-time', '180', '-o', archive, `https://registry.npmjs.org/${scope}/${name}/-/${name}-${version}.tgz`], { windowsHide: true });
    await run('tar', ['-xzf', archive, '--strip-components=1', '-C', dest], { windowsHide: true });
    await unlink(archive);
  }
}
const assets = join('node_modules', '.meme-runtime');
if (await access(join(root, assets, 'ready.json')).then(() => true, () => false)) await cp(join(root, assets), join(stage, assets), { recursive: true });
await prepare(stage);
if (withExtension) {
const pythonAssets = join('node_modules', '.meme-python');
if (await readFile(join(root, pythonAssets, 'ready.json'), 'utf8').then(text => JSON.parse(text).platform === `${process.platform}-${process.arch}`, () => false)) await cp(join(root, pythonAssets), join(stage, pythonAssets), { recursive: true });
await preparePython(stage);
}
await rename(stage, target);
console.log(`已安装：${target}。AuraBot 会在几秒内自动加载，无需重启。发送“#表情帮助”开始使用。`);
