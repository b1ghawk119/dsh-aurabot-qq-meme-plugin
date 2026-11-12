import { assertSkiaData } from './python-data.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
const args = process.argv.slice(2).filter(x => x !== '--with-extension');
const withExtension = process.argv.includes('--with-extension');
const root = resolve(args[0] || '.'), output = resolve(args[1] || '../meme-offline.tar.gz');
if (!existsSync(join(root, 'node_modules/.meme-runtime/ready.json'))) throw new Error('请先准备完整资源');
const ready = JSON.parse(readFileSync(join(root, 'node_modules/.meme-runtime/ready.json'), 'utf8'));
const expected = JSON.parse(readFileSync(new URL('./packs.json', import.meta.url), 'utf8'));
for (const pack of expected.packs) {
  const installed = ready.packs?.find(p => p.id === pack.id && p.release === pack.release);
  if (!installed || pack.keys.some(key => !installed.keys.includes(key))) throw new Error('扩展资源尚未准备完整，请先运行 scripts/prepare.mjs 或选择已安装的完整模块目录');
}
for (const file of ready.files) if (!existsSync(join(root, 'node_modules/.meme-runtime', file.path))) throw new Error(`缺少资源：${file.path}`);
if (withExtension) {
if (!existsSync(join(root, 'node_modules/.meme-python/ready.json'))) throw new Error('请先准备 Python 扩展资源 scripts/prepare-python.mjs');
const pythonHome = join(root, 'node_modules/.meme-python');
await assertSkiaData(pythonHome, JSON.parse(readFileSync(join(pythonHome, 'ready.json'), 'utf8')).platform);
}
execFileSync('tar', ['-czf', output, ...(!withExtension ? ['--exclude=.meme-python'] : []), '--exclude=.aurabot-cache', '--exclude=.git', '--exclude=test', '-C', dirname(root), basename(root)], { stdio: 'inherit' });
console.log(output);
