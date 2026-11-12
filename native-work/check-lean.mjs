import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const stage='C:/Users/Admin/.dsh/plugins-data/aurabot/modules-data/meme-lean-stage';
const { Engine } = await import(pathToFileURL(stage+'/lib/engine.mjs'));
const engine=new Engine(stage);
function canonical(value) {
 if(Array.isArray(value)) return value.map(canonical);
 if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(k==='tags'?[...value[k]].sort():value[k])]));
 return value;
}
try {
 const candidate=await engine.call('catalog');
 const live=await (await fetch('http://127.0.0.1:61225/aurabot/api/ext/meme/library')).json();
 const items=Array.isArray(candidate)?candidate:candidate.items;
 const old=new Map(live.items.map(x=>[x.key,x]));
 const changed=[];
 for(const m of items){const previous=old.get(m.key); const fields=Object.keys(m);const normalize=(v,k)=>canonical(k==='tags'?[...v].sort():v);if(!previous||fields.some(k=>JSON.stringify(normalize(m[k],k))!==JSON.stringify(normalize(previous[k],k))))changed.push(m.key);}
 const report={candidateCount:items.length,unique:new Set(items.map(m=>m.key)).size,liveCount:live.total,liveReady:live.ready,metadataChanged:changed,templateRenderTests:0,productionChanged:false};
 await writeFile(new URL('./lean-parity.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,metadataChanged:changed.length,firstChanged:changed.slice(0,3)}));
 if(items.length!==1003||changed.length)process.exitCode=1;
}finally{engine.dispose();}
