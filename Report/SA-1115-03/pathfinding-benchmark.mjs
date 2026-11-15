// Reproduce baseline/current timings with identical real code and grids.
// Timings describe this machine, not a universal performance guarantee.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gridPath as current} from '../../client/src/pathfinding.ts';
const dir=mkdtempSync(join(tmpdir(),'sa111503-path-'));
try {
 const path=join(dir,'baseline.ts');
 writeFileSync(path,execFileSync('git',['show','9a56234:client/src/pathfinding.ts']));
 const {gridPath:baseline}=await import(pathToFileURL(path).href);
 const size=600,open=new Uint8Array(size*size).fill(2),wall=open.slice();
 for(let y=0;y<size;y++)wall[y*size+300]=1;
 const cases=[['open-straight',open,0,300,599,300],['open-diagonal',open,0,0,599,599],['unreachable',wall,0,300,599,300]];
 const output=[];
 for(const [name,walk,sx,sy,tx,ty] of cases) {
  const algorithms=[['baseline',baseline],['current',current]],measurements=new Map(algorithms.map(([variant])=>[variant,{samples:[],length:null}]));
  for(const [,fn]of algorithms)for(let i=0;i<4;i++)fn(size,size,walk,sx,sy,tx,ty);
  // Alternate order to reduce bias from concurrent load and GC phases.
  for(let i=0;i<12;i++)for(const [variant,fn]of i%2?algorithms.slice().reverse():algorithms){
   const row=measurements.get(variant),began=performance.now(),path=fn(size,size,walk,sx,sy,tx,ty);
   row.samples.push(performance.now()-began);row.length=path?.length??null;
  }
  for(const [variant]of algorithms){const {samples,length}=measurements.get(variant);samples.sort((a,b)=>a-b);output.push({name,variant,size,length,median_ms:samples[6],p95_ms:samples[11],mean_ms:samples.reduce((a,b)=>a+b,0)/samples.length});}
 }
 for(let i=0;i<output.length;i+=2)if(output[i].length!==output[i+1].length)throw Error('baseline/current path cost mismatch');
 console.log(JSON.stringify({node:process.version,baseline:'9a56234',samples:12,warmup:4,order:'alternating',results:output},null,2));
}finally{rmSync(dir,{recursive:true,force:true});}
