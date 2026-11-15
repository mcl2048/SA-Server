import assert from "node:assert/strict";
import { gridPath, PATH_MOVE } from "../src/pathfinding.ts";
const follow = (sx:number,sy:number,p:number[]) => p.reduce(([x,y],d)=>[x+PATH_MOVE[d][0],y+PATH_MOVE[d][1]],[sx,sy]);
const map = (rows:string[]) => ({w:rows[0].length,h:rows.length,walk:Uint8Array.from(rows.join(""),v=>v==="#"?1:v==="?"?0:v==="W"?3:2)});
function path(rows:string[],sx:number,sy:number,tx:number,ty:number) { const {w,h,walk}=map(rows); return gridPath(w,h,walk,sx,sy,tx,ty); }
assert.deepEqual(path(["..",".."],0,0,1,1),[6]);
assert.equal(path([".#","#."],0,0,1,1),null,"cannot cut diagonal corner");
assert.equal(path([".#.",".#.",".#."],0,0,2,0),null,"disconnected returns failure, no nearest substitute");
assert.equal(path([".?."],0,0,2,0),null,"unknown cells blocked");
assert.equal(path([".W."],0,0,2,0),null,"cannot cross warp");
assert.deepEqual(path([".W"],0,0,1,0),[5],"warp destination allowed");
assert.deepEqual(path(["."],0,0,0,0),[]);
assert.equal(path(["."],0,0,1,0),null);
const around=path([".#...",".#...",".#...","....."],0,0,4,0)!;
assert.deepEqual(follow(0,0,around),[4,0],"routes around a U-shaped obstruction");
const long=path([".".repeat(400)],0,0,399,0)!;
assert.equal(long.length,399,"long path exceeds legacy 100 step limit");
// Differential check against a simple BFS oracle over every pair on a small maze.
const {w,h,walk}=map(["....",".#..","..#.","...."]);
for(let start=0;start<w*h;start++) for(let goal=0;goal<w*h;goal++) {
 if(walk[start]<2||walk[goal]<2) continue;
 const queue=[start], dist=new Map([[start,0]]);
 for(let i=0;i<queue.length;i++) { const k=queue[i], x=k%w,y=Math.floor(k/w); for(const [dx,dy] of PATH_MOVE) { const nx=x+dx,ny=y+dy,nk=ny*w+nx; if(nx<0||ny<0||nx>=w||ny>=h||walk[nk]<2||dist.has(nk)) continue; if(dx&&dy&&(walk[y*w+nx]<2||walk[ny*w+x]<2)) continue; dist.set(nk,dist.get(k)!+1);queue.push(nk); } }
 const result=gridPath(w,h,walk,start%w,Math.floor(start/w),goal%w,Math.floor(goal/w));
 assert.equal(result?.length,dist.get(goal));
}
// A wide entrance may have a wall-facing edge. Choose any legal entry using
// the same shortest-path search instead of repeatedly trying a guessed center.
assert.deepEqual(gridPath(5,3,Uint8Array.from([2,2,2,2,2,2,1,1,1,3,2,2,2,2,3]),0,0,4,2,[[4,1]]),[5,5,5,5,7]);
assert.equal(gridPath(2,2,new Uint8Array(1),0,0,1,1),null,"malformed dimensions cannot produce a path");
assert.deepEqual(gridPath(5,3,new Uint8Array(15).fill(2),0,1,4,1),[5,5,5,5],"equally short open routes should follow the direct line without a zigzag");
// Deterministic independent BFS oracle over walls, unknown tiles, non-target
// warps and doorways. It checks actual shortest costs and reconstructed moves.
let seed=0x111503;
const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let sample=0;sample<300;sample++) {
 const w=8,h=8,walk=Uint8Array.from({length:w*h},()=>[0,1,2,2,2,3][random(6)]);
 const start=random(w*h),goals=[random(w*h),random(w*h),random(w*h)];walk[start]=2;
 const targets=new Set(goals.filter(k=>walk[k]>=2)),queue=[start],distance=new Map([[start,0]]);
 const enter=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&walk[y*w+x]>=2;
 let expected:number|null=null;
 for(let i=0;i<queue.length;i++) {
  const k=queue[i],x=k%w,y=Math.floor(k/w),g=distance.get(k)!;
  if(targets.has(k)){expected=g;break;}
  if(k!==start&&walk[k]===3)continue;
  for(const [dx,dy]of PATH_MOVE){const nx=x+dx,ny=y+dy,nk=ny*w+nx;if(!enter(nx,ny)||distance.has(nk)||dx&&dy&&(!enter(x+dx,y)||!enter(x,y+dy)))continue;distance.set(nk,g+1);queue.push(nk);}
 }
 const path=gridPath(w,h,walk,start%w,Math.floor(start/w),goals[0]%w,Math.floor(goals[0]/w),goals.slice(1).map(k=>[k%w,Math.floor(k/w)]));
 assert.equal(path?.length??null,expected,`BFS shortest multi-entrance cost, sample ${sample}`);
 if(path){let x=start%w,y=Math.floor(start/w);for(let i=0;i<path.length;i++){const [dx,dy]=PATH_MOVE[path[i]];assert.ok(enter(x+dx,y+dy));if(dx&&dy)assert.ok(enter(x+dx,y)&&enter(x,y+dy));x+=dx;y+=dy;if(i<path.length-1)assert.notEqual(walk[y*w+x],3);}assert.ok(targets.has(y*w+x));}
}
console.log("pathfinding: all checks and 300 mixed-grid BFS comparisons passed");
