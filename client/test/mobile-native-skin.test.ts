import test from "node:test";
import assert from "node:assert/strict";
import { MobileNativeSkin } from "../src/mobile-native-skin.ts";

test("fullscreen skin reuses native nine-slice art and caches decoded icons across frames", async () => {
  const draws: unknown[][]=[]; const loads: number[]=[];
  Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>({imageSmoothingEnabled:true,drawImage(...args: unknown[]){draws.push(args);}}),toDataURL:()=>"data:image/png;base64,window"})}});
  const icon={dataset:{mobileControl:"menu-pets"},style:{setProperty(k:string,v:string){this[k]=v;}}};
  const root={style:{setProperty(k:string,v:string){this[k]=v;}},querySelectorAll:()=>[icon]};
  const skin=new MobileNativeSkin({imageCanvas:async (id:number)=>{
    loads.push(id);return [{width:64,height:48,toDataURL:()=>`data:image/png;base64,${id}`},0,0];
  }} as any);
  await skin.sync(root as any);
  assert.deepEqual(loads,[26001,26002,26003,26004,26005,26006,26007,26008,26009,26154]);
  assert.equal(draws.length,9); assert.match(root.style["--native-window"],/data:image\/png/);
  assert.match(icon.style["--native-icon"],/26154/);
  await skin.sync(root as any); assert.equal(loads.length,10,"unchanged frames cannot decode all atlas pages again");
});

test("unavailable optional native art leaves controls operational and retries bounded", async () => {
  let calls=0;
  const skin=new MobileNativeSkin({imageCanvas:async()=>{calls++;throw new Error("offline");}} as any);
  const root={style:{setProperty(){throw new Error("no art should be installed");}},querySelectorAll:()=>[]};
  await skin.sync(root as any);await skin.sync(root as any);
  assert.equal(calls,1,"failed skin requests cannot create a per-frame fetch loop");
});

test("overlapping native frames coalesce into one decoder and still skin newly added controls", async () => {
  let active=0,peak=0;const loaded:number[]=[];
  const buttons:any[]=[];
  const skin=new MobileNativeSkin({imageCanvas:async(id:number)=>{
    loaded.push(id);peak=Math.max(peak,++active);
    await new Promise(resolve=>setImmediate(resolve));active--;
    return [{width:64,height:48,toDataURL:()=>`data:image/png;base64,${id}`},0,0];
  }} as any);
  const root={style:{setProperty(){}},querySelectorAll:()=>buttons};
  const first=skin.sync(root as any);
  for(let i=0;i<60;i++) assert.equal(skin.sync(root as any),first);
  buttons.push({dataset:{action:"b-attack"},style:{setProperty(){}}});
  await first;
  assert.equal(peak,1,"a phone may never need multiple decoded atlas pages concurrently");
  assert.equal(loaded.filter(id=>id===25100).length,1);
});

test("selected native model is bounded, cached and cannot overwrite a newer pet selection", {timeout:2000}, async () => {
  const loaded:number[]=[];let finishFirst: (()=>void) | undefined;let reachedFirst: (()=>void) | undefined;
  const reached=new Promise<void>(resolve=>{reachedFirst=resolve;});
  const outputs:any[]=[];
  Object.assign(globalThis,{document:{createElement:()=>{
    const output:any={width:0,height:0,source:0,getContext:()=>({drawImage(original:any){output.source=original.id;}}),toDataURL:()=>`data:image/png;base64,${output.source}`};
    outputs.push(output);return output;
  }}});
  const skin=new MobileNativeSkin({imageCanvas:async(id:number)=>{
    loaded.push(id);if(id===9000010)await new Promise<void>(resolve=>{finishFirst=resolve;reachedFirst!();});
    return [{id,width:1600,height:1200,toDataURL:()=>`data:image/png;base64,${id}`},0,0];
  }} as any);
  const root={style:{setProperty(){}},querySelectorAll:()=>[]};
  const target:any={src:"",hidden:true};
  const first=skin.sync(root as any,{target,image:9000010,rawIndex:true});
  await reached;
  skin.sync(root as any,{target,image:9000011,rawIndex:true});finishFirst!();await first;
  assert.equal(target.src,"data:image/png;base64,9000011");assert.equal(target.hidden,false);
  assert.ok(outputs.slice(1).every(output=>output.width<=192 && output.height<=176),"cached poses have a fixed pixel budget");
  const count=loaded.length;await skin.sync(root as any,{target,image:9000011,rawIndex:true});
  assert.equal(loaded.length,count,"static preview cannot decode a model every animation frame");
});

test("native inventory art follows a reused slot and clears when the slot becomes empty", async () => {
  const icon:any={dataset:{action:"inv-9",nativeImage:"24001"},style:{setProperty(k:string,v:string){this[k]=v;},removeProperty(k:string){delete this[k];}}};
  const root={style:{setProperty(){}},querySelectorAll:()=>[icon]};
  const skin=new MobileNativeSkin({imageCanvas:async(id:number)=>[{width:48,height:48,toDataURL:()=>`data:image/png;base64,${id}`},0,0]} as any);
  await skin.sync(root as any);assert.match(icon.style["--native-icon"],/24001/);
  icon.dataset.nativeImage="24002";await skin.sync(root as any);assert.match(icon.style["--native-icon"],/24002/);
  icon.dataset.nativeImage="";await skin.sync(root as any);
  assert.equal(icon.dataset.nativeIcon,undefined);assert.equal(icon.style["--native-icon"],undefined);
});
