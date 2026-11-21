// Run with node --experimental-strip-types and the private fixture path exported
// by navigation-resource-audit_test.go.txt. No resource/asset payload is committed.
// This is a Field + native-grid transport model, not a live server/browser test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Field, MOVE } from '../../client/src/field.ts';
import { fillDefaults } from '../../client/src/proto.gen.ts';

const fixtures=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const maps=new Map(fixtures.map(m=>[m.id,m]));
const starts=new Map([[700,[345,130]],[701,[305,14]],[702,[388,10]],[703,[238,96]],[704,[13,81]],
  [705,[82,364]],[706,[28,390]],[707,[308,281]],[708,[382,387]],[817,[146,19]]]);
const results=[];
for(const [id,start] of starts){
 const map=maps.get(id);
 const npcs=(map.npcs??[]).filter(n=>n.Name&&n.X>=0&&n.Y>=0&&n.X<map.w&&n.Y<map.h).map(n=>({name:n.Name,x:n.X,y:n.Y}));
 const catalogue=fillDefaults({t:'NpcList',floor:id,npcs,places:structuredClone(map.places),transfers:structuredClone(map.transfers)});
 const goals=[...npcs.map((npc,index)=>({kind:'npc',name:npc.name,x:npc.x,y:npc.y,index})),
  ...catalogue.places.map((p,index)=>({kind:'place',name:p.name,toFloor:p.floor,index,conditional:p.conditional}))];
 for(const goal of goals){
  const handlers=new Map(),sent=[];
  const field=new Field({}, {on:(t,h)=>{handlers.set(t,h);return()=>{};},send:m=>sent.push(m)});
  const send=m=>handlers.get(m.t)?.(m);
  const enter=(floor,x,y)=>{const m=maps.get(floor);send({t:'EnterFloor',floor,name:m.name,width:m.w,height:m.h,x,y,dir:5,palette:0,mapVer:`resource-${floor}`,step:260});};
  send({t:'Self',id:1,name:'resource navigator',sprite:100000});enter(id,...start);await new Promise(r=>setImmediate(r));
  send(structuredClone(catalogue));
  if(goal.kind==='npc')field.navigateNpc(id,field.npcList(id)[goal.index]);
  else field.navigatePlace(id,field.mapPlaces(id)[goal.index]);
  // Arriving onto a warp never retriggers it. A catalogue entry already under
  // the character is a zero-step arrival, not evidence of a failed route.
  const alreadyAtEntrance=goal.kind==='place'&&catalogue.places[goal.index].entrances.some(p=>p.x===start[0]&&p.y===start[1]);
  const began=performance.now();let moves=0,requests=0,maxPending=0,planningFrames=0,terminal=false,conditionalBoundary=false,warpChain=[];
  for(let frame=0;frame<20000;frame++){
   field.update(began+1000+frame*300);maxPending=Math.max(maxPending,field.pending.size);
   if(field.navigationStatus==='正在规划路线…')planningFrames++;
   for(let cursor=0;cursor<sent.length;cursor++){
    const message=sent[cursor],m=maps.get(field.floor);
    if(message.t==='MapReq'){
     requests++;let walk='';
     for(let y=message.y1;y<message.y2;y++)for(let x=message.x1;x<message.x2;x++)walk+=m.walk[y*m.w+x];
     send({...message,t:'MapData',walk,tiles:Array(walk.length).fill(100),objs:Array(walk.length).fill(0),ver:`resource-${m.id}`});
    }else if(message.t==='NpcListReq'){
     // Late old-floor replies are possible after a transfer. The field must
     // ignore them; only the active floor receives its current snapshot.
     const requested=maps.get(message.floor);
     if(requested)send(fillDefaults({t:'NpcList',floor:message.floor,npcs:message.floor===id?structuredClone(npcs):[],places:structuredClone(requested.places),transfers:structuredClone(requested.transfers)}));
    }else if(message.t==='Move'){
     moves++;const [dx,dy]=MOVE[message.dir],x=message.x+dx,y=message.y+dy;
     const walkable=(x,y)=>x>=0&&y>=0&&x<m.w&&y<m.h&&m.walk[y*m.w+x]!=='0';
     assert.ok(walkable(x,y),`wall/unknown move on ${m.id}`);
     assert.ok(!dx||!dy||walkable(message.x+dx,message.y)&&walkable(message.x,message.y+dy),`corner cut on ${m.id}`);
     const wp=(m.warps??[]).find(w=>w.X===x&&w.Y===y);
     if(wp){
      const isGoal=goal.kind==='place'&&m.id===id&&catalogue.places[goal.index].entrances.some(p=>p.x===x&&p.y===y);
      if(wp.Free){assert.ok(isGoal,'conditional portal crossed as an intermediate');conditionalBoundary=true;terminal=true;break;}
      warpChain.push({floor:m.id,x,y,toFloor:wp.ToFloor,toX:wp.ToX,toY:wp.ToY});
      if(isGoal){terminal=true;break;}
      assert.ok(maps.has(wp.ToFloor),'unplanned external-floor route');enter(wp.ToFloor,wp.ToX,wp.ToY);await new Promise(r=>setImmediate(r));
     }
    }
   }
   sent.length=0;
   if(terminal||!field.target&&!field.waitingWarp)break;
  }
  assert.ok(maxPending<=2,`map concurrency ${maxPending}`);
  const arrived=goal.kind==='npc'&&field.floor===id&&Math.max(Math.abs(field.self.x-goal.x),Math.abs(field.self.y-goal.y))<=1&&/到达/.test(field.navigationStatus);
  results.push({floor:id,start,goal,moves,requests,maxPending,planningFrames,warpChain,end:[field.floor,field.self.x,field.self.y],status:field.navigationStatus,arrived:goal.kind==='npc'?arrived:terminal||alreadyAtEntrance,alreadyAtEntrance,conditionalBoundary,modelMs:Math.round(performance.now()-began)});
  field.dispose();
 }
}
console.log(JSON.stringify({scope:'Field + effective native grid transport model; no live authority or browser',cases:results.length,arrived:results.filter(r=>r.arrived).length,failed:results.filter(r=>!r.arrived),results},null,2));
