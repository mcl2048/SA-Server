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
console.log("pathfinding: all checks passed");
