// Independent unbounded BFS over the privately exported Eden/sea floors. This
// explains scope limits; the shipped navigator intentionally has bounded edges.
import fs from 'node:fs';
const fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const cases=JSON.parse(fs.readFileSync(new URL('./navigation-resource-cases.json',import.meta.url),'utf8')).failed;
const move=[[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1]];
let size=0;const floors=fixtures.map(m=>{const f={...m,offset:size,warps:new Map((m.warps??[]).map(w=>[w.Y*m.w+w.X,w]))};size+=m.w*m.h;return f;});
const maps=new Map(floors.map(m=>[m.id,m]));
const identify=k=>floors.find(m=>k>=m.offset&&k<m.offset+m.w*m.h);
const results=[];
for(const c of cases){
 const f=maps.get(c.floor),place=f.places[c.goal.index],goals=new Set(place.entrances.map(p=>(p.y??0)*f.w+(p.x??0)+f.offset));
 const start=f.offset+c.start[1]*f.w+c.start[0];
 const parents=new Int32Array(size).fill(-2),through=new Int32Array(size).fill(-1),queue=new Int32Array(size);let head=0,tail=0,found=-1;
 parents[start]=-1;queue[tail++]=start;
 while(head<tail){
  const k=queue[head++],m=identify(k),tile=k-m.offset,x=tile%m.w,y=Math.floor(tile/m.w);
  if(goals.has(k)){found=k;break;}
  const enter=(x,y)=>x>=0&&y>=0&&x<m.w&&y<m.h&&m.walk[y*m.w+x]!=='0';
  for(const [dx,dy]of move){
   const nx=x+dx,ny=y+dy;if(!enter(nx,ny)||dx&&dy&&(!enter(x+dx,y)||!enter(x,y+dy)))continue;
   const entered=m.offset+ny*m.w+nx,wp=m.warps.get(ny*m.w+nx);let nk=entered;
   if(wp&&!goals.has(entered)){
    const dest=maps.get(wp.ToFloor);if(wp.Free||!dest||dest.walk[wp.ToY*dest.w+wp.ToX]==='0')continue;
    nk=dest.offset+wp.ToY*dest.w+wp.ToX;
   }
   if(parents[nk]!==-2)continue;parents[nk]=k;if(nk!==entered)through[nk]=entered;queue[tail++]=nk;
  }
 }
 let steps=0,warpChain=[];
 if(found>=0)for(let k=found;parents[k]>=0;k=parents[k]){steps++;if(through[k]>=0){const m=identify(through[k]);warpChain.push(m.warps.get(through[k]-m.offset));}}
 results.push({floor:c.floor,start:c.start,goal:c.goal,reachable:found>=0,alreadyAtEntrance:goals.has(start),steps,warpChain:warpChain.reverse().map(w=>({floor:w.Floor,x:w.X,y:w.Y,toFloor:w.ToFloor,toX:w.ToX,toY:w.ToY})),visited:tail});
}
console.log(JSON.stringify({scope:'Independent global BFS limited to privately exported 11-floor dataset; not shipped behavior',results},null,2));
