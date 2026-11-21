import assert from 'node:assert/strict';
import {gridRouteSteps,PATH_MOVE} from '../../../client/src/pathfinding.ts';
let seed=0x112101;const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
let cases=0,multiSource=0,warpLandings=0;
for(;cases<10000;cases++){
 const w=3+random(7),h=2+random(6),walk=Uint8Array.from({length:w*h},()=>random(5)?2:1);
 const sx=random(w),sy=random(h),tx=random(w),ty=random(h);walk[sy*w+sx]=2;walk[ty*w+tx]=2;
 const transfers:{x:number,y:number,toX:number,toY:number}[]=[];
 for(let i=0,n=1+random(6);i<n;i++){const p={x:random(w),y:random(h),toX:random(w),toY:random(h)};if(p.x===p.toX&&p.y===p.toY)continue;walk[p.y*w+p.x]=3;if(walk[p.toY*w+p.toX]===1)walk[p.toY*w+p.toX]=2;transfers.push(p);}
 for(let i=0;i<transfers.length;i++)for(let j=0;j<i;j++)if(transfers[i].x===transfers[j].x&&transfers[i].y===transfers[j].y)multiSource++;
 for(const p of transfers)if(walk[p.toY*w+p.toX]===3)warpLandings++;
 const start=sy*w+sx,goal=ty*w+tx,enter=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&walk[y*w+x]>=2;
 const jumps=new Map<number,typeof transfers>();for(const p of transfers){const k=p.y*w+p.x;jumps.set(k,[...(jumps.get(k)??[]),p]);}
 // Reference BFS models the actual Move rule: stepping onto an advertised
 // source jumps; a landing tile does not immediately trigger another warp.
 const queue=[start],seen=new Set([start]);let reached=false;
 for(let i=0;i<queue.length;i++){
  const k=queue[i];if(k===goal){reached=true;break;}const x=k%w,y=Math.floor(k/w);
  for(const [dx,dy] of PATH_MOVE){const nx=x+dx,ny=y+dy;if(!enter(nx,ny)||(dx&&dy&&(!enter(nx,y)||!enter(x,ny))))continue;
   const at=ny*w+nx,ps=at===goal?undefined:jumps.get(at);
   if(!ps&&walk[at]===3&&at!==goal)continue;
   for(const p of ps??[undefined]){const next=p?p.toY*w+p.toX:at;if(!seen.has(next)){seen.add(next);queue.push(next);}}
  }
 }
 const search=gridRouteSteps(w,h,walk,sx,sy,tx,ty,[],transfers);let result=search.next(),slices=0;while(!result.done){assert.ok(++slices<1000);result=search.next();}
 assert.equal(result.value!==null,reached,`reachability case=${cases} seed=${seed}`);
 if(result.value){let x=sx,y=sy;const p=result.value.transfer;
  for(const [i,d]of result.value.path.entries()){assert.ok(d>=0&&d<8);const [dx,dy]=PATH_MOVE[d],nx=x+dx,ny=y+dy;assert.ok(enter(nx,ny));assert.ok(!(dx&&dy)||enter(nx,y)&&enter(x,ny));x=nx;y=ny;if(i<result.value.path.length-1)assert.notEqual(walk[y*w+x],3);}
  if(p){assert.ok(transfers.includes(p as any));assert.equal(x,p.x);assert.equal(y,p.y);}else{assert.equal(x,tx);assert.equal(y,ty);}
 }
}
console.log(JSON.stringify({cases,initialSeed:'0x112101',multipleSameSourcePairs:multiSource,transferLandingsOnWarp:warpLandings,result:'PASS'}));
