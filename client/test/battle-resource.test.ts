import assert from "node:assert/strict";
import test from "node:test";
import { BattleScreen, type BattleHost } from "../src/battle.ts";
import { ANIM } from "../src/assets.ts";
import { setDeviceMode } from "../src/mobile-view.ts";

function uiScreen() {
 const pics:any[] = [], boxes:any[]=[];
 const screen:any=Object.create(BattleScreen.prototype);
 screen.host={ui:{texts:[],image:()=>{},pic:(canvas:any,x:number,y:number)=>pics.push({canvas,x,y}),box:(...a:any[])=>boxes.push(a)}};screen.fx=[];
 // No fake browser: geometry tests stub only rasterization. Actual Canvas font,
 // outline and measurements are checked by the real Chromium component script.
 screen.combatLabel=(text:string,size:number,color:string)=>({width:Math.min(128,text.length*size*.6+12),height:size+12,text,size,color});
 return {screen,pics,boxes};
}
test("compact HP/MP rows clamp values and horizontal bounds on both viewports",()=>{
 for(const mobile of [false,true]){
  const {screen,pics,boxes}=uiScreen();
  screen.resourceCard(0,400,150,100,mobile,"HP");screen.resourceCard(800,440,-1,0,mobile,"MP");
  assert.equal(pics[0].canvas.text,"HP 100/100");assert.equal(pics[1].canvas.text,"MP 0/0");
  assert.equal(pics[0].canvas.size,mobile?20:14);
  assert.ok(pics.every(p=>p.x>=0&&p.x+p.canvas.width<=800));
  assert.ok(boxes.every(b=>b.slice(0,4).every(Number.isFinite)));
 }
});
test("five enemy damage labels remain inside every stage edge throughout the bounce",()=>{
 for(const mobile of [false,true]){
  setDeviceMode(mobile?"mobile":"desktop");
  const {screen,pics}=uiScreen();
  for(const x of [0,160,320,640,800])screen.popup({x,y:60,rect:[x-20,-10,40,70]},100,{text:"999999"});
  for(const age of [0,100,200,400,800,1200])for(const f of screen.fx)f.draw(0,age);
  assert.ok(pics.every(p=>p.y>=4&&p.y+p.canvas.height<=596&&p.x>=4&&p.x+p.canvas.width<=796));
  assert.ok(pics.every(p=>p.canvas.color==="#ffdf45"));
 }
});
test("HP/MP rows lie below actual model bounds including tall pets and riding HP",()=>{
 const {screen,pics,boxes}=uiScreen();
 screen.me=0;screen.host.names=()=>false;screen.host.assets={image:()=>({ox:-30,oy:-150,w:60,h:160})};
 screen.fighters=new Map([[0,{f:{slot:0,maxHp:100,maxMp:30,rideMaxHp:50},x:600,y:300,hp:80,mp:20,rideHp:40,frame:()=>[1,0,0]}]]);
 screen.drawFighters(100);
 assert.equal(pics.length,1);assert.ok(pics.every(p=>p.y>=315),"all resource pixels below sprite bottom310 + gap5");assert.ok(boxes.every(b=>b[1]>=315),"HP/MP/riding bars also below silhouette");
});
test("absent legacy event metadata never creates NaN labels or invalid skill icons",()=>{
 const {screen}=uiScreen();screen.fighters=new Map([[0,{gone:false}]]);
 assert.deepEqual(screen.eventSteps([{kind:"stat",actor:0,target:0}]),[]);screen.skillIcon({},undefined,100);assert.deepEqual(screen.fx,[]);
});

test("snapshot dead players and pets on both sides choose genuine DEAD pose and revive",()=>{
 const frames=(type:number,dir:number)=>({type,dir,ticks:1,frames:[[100+type,0,0,0],[200+type,0,0,0]]});
 const host:any={quick:()=>true,assets:{anim:()=>({actions:[frames(ANIM.STAND,3),frames(ANIM.STAND,7),frames(ANIM.DEAD,0)]})},root:"",aiMemory:()=>({}),pets:()=>({pets:[]}),serverAuto:()=>false};
 const fighters=[0,5,10,15].map(slot=>({slot,sprite:100001,hp:0,mp:0,maxHp:100,status:0}));
 const screen:any=new BattleScreen(host as BattleHost,{fighters,mySlot:0,resume:true,turn:1} as any);
 for(const a of screen.fighters.values()){
  assert.equal(a.frame(host.assets,5000)[0],202,"missing directional DEAD must select other actual DEAD, not stand");
  a.play(ANIM.STAND,5001,true);assert.equal(a.frame(host.assets,6000)[0],102,"later idle cannot stand a corpse up");assert.equal(a.frame(host.assets,7000)[0],202);
  a.dead=false;a.hp=50;assert.equal(a.frame(host.assets,6001)[0],103,"revival restores stand");assert.equal(a.stars,false);
 }
 screen.popup=()=>{};screen.hitMark=()=>{};
 const target=screen.fighters.get(5),actor=screen.fighters.get(10);
 screen.applyHit({result:'guard',hp:0,status:0,actorHp:50,dead:false,fly:false},target,actor,8000,0);
 assert.equal(target.dead,true,'authoritative HP0 kills even when optional dead flag is absent/false');
 assert.equal(target.frame(host.assets,9000)[0],202,'damage KO ends in actual DEAD pose');
 target.stars=true;target.deadAt=1;target.dying=true;
 screen.applyMagic({result:'revive',hp:50,damage:50,mpDamage:0,petDamage:0},target,actor,10000);
 target.frame(host.assets,10001);
 assert.equal(target.dead,false);assert.equal(target.stars,false);assert.equal(target.deadAt,0);assert.equal(target.dying,false);
 target.dead=true;target.stars=true;target.deadAt=1;target.dying=true;
 screen.showSkill=()=>{};
 const steps=screen.eventSteps([{kind:'revive',actor:10,target:5,hp:50,damage:50,status:0}]);
 for(const step of steps){step(11000);step(12000);}
 assert.equal(target.dead,false);assert.equal(target.stars,false);assert.equal(target.deadAt,0);assert.equal(target.dying,false);
});

test("crowded real battle formation keeps every full HP/MP/riding row disjoint and inside the stage",()=>{
 const intersects=(a:number[],b:number[])=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
 for(const mobile of [false,true]){
  setDeviceMode(mobile?'mobile':'desktop');
  const {screen,pics,boxes}=uiScreen();screen.me=0;screen.host.names=()=>false;
  const rects=[[-19,-53,34,59],[-80,-140,160,160],[-80,-140,160,160],[-80,-140,160,160],[-80,-140,160,160],[-25,-33,42,43]];
  // Canonical slotPos coordinates for a player plus five pets, including
  // oversized mechanical pets and the lowest slot at y=552/528.
  const positions=[[677,504],[581,432],[517,480],[645,384],[453,528],[709,336]];
  screen.host.assets={image:(i:number)=>{const [ox,oy,w,h]=rects[i];return{ox,oy,w,h};}};
  const fighters=positions.map(([x,y],i)=>({f:{slot:i===0?0:i+4,maxHp:i===0?6050:655,maxMp:i===0?100:0,rideMaxHp:i===0?500:0},x,y,hp:i===0?6050:574,mp:50,rideHp:400,frame:()=>[i,0,0]}));
  // Exact rects captured from the actual five-enemy mobile screenshot.
  const enemyRects=[[170,134,58,86],[106,182,58,86],[234,86,58,86],[42,230,58,86],[298,38,58,86]];
  const all=[...fighters,...enemyRects.map(([x,y,w,h],i)=>({f:{slot:15+i},x,y,hp:100,frame:()=>[6+i,0,0]}))];
  const image=screen.host.assets.image;screen.host.assets.image=(i:number)=>i<6?image(i):{ox:0,oy:0,w:58,h:86};
  screen.fighters=new Map(all.map(a=>[a.f.slot,a]));screen.drawFighters(100);
  assert.equal(pics.length,6,'all six cards must find free 2D space');
  const cards=pics.map((p:any)=>[p.x,p.y,p.canvas.width,p.canvas.height+(p.canvas.text.startsWith('HP 6050/')?13:7)]);
  for(let i=0;i<cards.length;i++){
   const c=cards[i];assert.ok(c[0]>=4&&c[1]>=4&&c[0]+c[2]<=796&&c[1]+c[3]<=596);
   assert.ok(all.every(a=>!intersects(c,a.rect)),'no model covered');
   assert.ok(cards.slice(i+1).every(o=>!intersects(c,o)),'no cards overlap');
  }
  assert.ok(boxes.every(b=>b[0]>=0&&b[1]>=0&&b[2]<=800&&b[3]<=600),'including thin MP/riding bars');
 }
});
