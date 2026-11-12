import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareSkiaData } from '../scripts/python-data.mjs';
import { stopProcessTree } from './process.mjs';
import { UserError } from './errors.mjs';

export function cachedExtension(dir) {
  const home = join(dir, 'node_modules', '.meme-python');
  try {
    const ready = JSON.parse(readFileSync(join(home, 'ready.json'), 'utf8'));
    return ready.platform === `${process.platform}-${process.arch}` && existsSync(join(home, ready.executable)) && existsSync(join(home, 'catalog.json'));
  } catch { return false; }
}
export class ExtensionManager {
  constructor({ dir, engine, onCatalog, save, log, prepare }) {
    Object.assign(this, { dir, engine, onCatalog, save, log });
    this.installed=false; this.count=0; this.busy=false; this.error=''; this.disposed=false; this.child=null;
    this.prepare = prepare || (() => this.prepareFiles());
  }
  status() { return { installed:this.installed, count:this.count, cached:cachedExtension(this.dir), busy:this.busy, error:this.error }; }
  async mount(enabled) {
    if(this.disposed) throw new UserError('模块已停止');
    const result=await this.engine.call('extension',{enabled});
    this.onCatalog(result); this.installed=!!result.extensionEnabled; this.count=result.extensionCount || 0;
  }
  async restore() {
    try { await this.mount(true); }
    catch(e) { this.log.warn('扩展库加载失败',e.stack || String(e)); this.error='扩展库未能加载，请重新安装。'; }
  }
  start(enabled) {
    if(this.disposed) throw new UserError('模块已停止');
    if(this.busy) throw new UserError('扩展库正在处理，请稍后');
    this.busy=true; this.error='';
    this.task=this.change(enabled).catch(e=>{
      this.log.warn('扩展库操作失败', e.stack || String(e));
      this.error=enabled?'安装未完成，请重试。':'卸载未完成，请重试。';
    }).finally(()=>{this.busy=false;});
    return this.status();
  }
  async change(enabled) {
    if(enabled) await this.prepare();
    if(this.disposed) return;
    const previous=this.installed;
    await this.mount(enabled);
    if(this.disposed) return;
    try { await this.save({extensionEnabled:enabled}); }
    catch(e) { await this.mount(previous); throw e; }
  }
  async prepareFiles() {
    if(cachedExtension(this.dir)) {
      await prepareSkiaData(join(this.dir,'node_modules','.meme-python'),`${process.platform}-${process.arch}`);
      return;
    }
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[join(this.dir,'scripts','prepare-python.mjs'),this.dir],{
        windowsHide:true, detached:process.platform!=='win32', stdio:['ignore','pipe','pipe'],
        env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}
      });
      this.child=child;
      let tail='';const output=b=>{tail=(tail+b).slice(-4000);};child.stdout.on('data',output);child.stderr.on('data',output);
      child.once('error',reject);
      child.once('close',code=>{if(this.child===child)this.child=null;code===0?resolve():reject(new Error(`扩展准备退出 (${code}) ${tail}`));});
    });
  }
  dispose() { this.disposed=true;stopProcessTree(this.child);this.child=null; }
}
