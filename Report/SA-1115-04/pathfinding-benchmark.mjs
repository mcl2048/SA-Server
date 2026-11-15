// Fixed grids and alternating samples; measures CPU slices separately from
// total work. Frame wall time also includes unrelated renderer/browser work.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gridPath,gridPathSteps} from '../../client/src/pathfinding.ts';
const dir=mkdtempSync(join(tmpdir(),'sa111504-bench-'));
try{
 const file=join(dir,'baseline.ts');writeFileSync(file,execFileSync('git',['show','08e2544:client/src/pathfinding.ts']));
 const {gridPath:baseline}=await import(pathToFileURL(file));
 const n=600,open=new Uint8Array(n*n).fill(2),wall=open.slice(),detour=open.slice();
 for(let y=0;y<n;y++){wall[y*n+300]=1;if(y<n-25)detour[y*n+300]=1;}
 const cases=[['open-straight',open,0,300,599,300],['open-diagonal',open,0,0,599,599],['detour',detour,0,300,599,300],['unreachable',wall,0,300,599,300]];
 const results=[];
 for(const [name,walk,sx,sy,tx,ty] of cases){
  const rows={baseline:[],current:[],cooperative:[]};let expected;
  for(let sample=0;sample<7;sample++)for(const variant of sample%2?['cooperative','current','baseline']:['baseline','current','cooperative']){
   let elapsed,maxSlice=0,slices=0,path;const start=performance.now();
   if(variant==='cooperative'){
    const search=gridPathSteps(n,n,walk,sx,sy,tx,ty);
    for(;;){const at=performance.now(),r=search.next();maxSlice=Math.max(maxSlice,performance.now()-at);slices++;if(r.done){path=r.value;break;}}
   }else path=(variant==='baseline'?baseline:gridPath)(n,n,walk,sx,sy,tx,ty);
   elapsed=performance.now()-start;const length=path?.length??null;
   if(sample===0&&variant==='baseline')expected=length;
   if(length!==expected)throw Error('path cost mismatch '+name);
   if(sample>0)rows[variant].push({elapsed,maxSlice,slices,length});
  }
  for(const [variant,samples]of Object.entries(rows)){
   const sorted=samples.map(r=>r.elapsed).sort((a,b)=>a-b);
   results.push({name,variant,length:samples[0].length,median_ms:sorted[3],max_ms:sorted.at(-1),max_slice_ms:variant==='cooperative'?Math.max(...samples.map(r=>r.maxSlice)):undefined,slices:samples[0].slices});
  }
 }
 console.log(JSON.stringify({baseline:'08e2544',node:process.version,size:n,samples:6,warmup:1,results},null,2));
}finally{rmSync(dir,{recursive:true,force:true});}
