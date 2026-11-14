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

function animationHarness() {
  const callbacks = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const outputs: any[] = [], loaded: number[] = []; let active = 0, peak = 0;
  const motion = Object.assign(new EventTarget(), {matches: false});
  const doc = Object.assign(new EventTarget(), {hidden: false, createElement: () => {
    const canvas: any = {width: 0, height: 0, id: 0, draws: [], getContext: () => ({drawImage(source: any, ...args: number[]) {canvas.id = source.id; canvas.draws.push(args);}}),
      toDataURL: () => `data:image/png;base64,${canvas.id}`}; outputs.push(canvas); return canvas;
  }});
  Object.assign(globalThis, {document: doc, matchMedia: () => motion,
    requestAnimationFrame: (cb: FrameRequestCallback) => {callbacks.set(++sequence, cb); return sequence;},
    cancelAnimationFrame: (id: number) => callbacks.delete(id)});
  const skin = new MobileNativeSkin({imageCanvas: async (id: number) => {
    loaded.push(id); peak = Math.max(peak, ++active); await new Promise(resolve => setImmediate(resolve)); active--;
    return [{id, width: 80, height: 100, toDataURL: () => `data:image/png;base64,${id}`}, -40, -90];
  }} as any);
  const root: any = {style: {setProperty() {}}, querySelectorAll: () => []};
  const target: any = {src: "", hidden: true};
  const pose: any = {target, image: 901, rawIndex: true, animation: {key: "pet:one", ticks: 6, frames: [[901, 0, 0, 0], [902, 4, -2, 0]]}};
  const frame = (now: number) => {const pending = [...callbacks.values()]; callbacks.clear(); for (const callback of pending) callback(now);};
  return {skin, root, target, pose, loaded, outputs, callbacks, motion, doc, frame, peak: () => peak};
}

test("native pet portrait advances at native ticks without decoding or restarting unchanged metadata", async t => {
  let now = 0; t.mock.method(performance, "now", () => now);
  const h = animationHarness(); await h.skin.sync(h.root, h.pose);
  assert.equal(h.target.src, "data:image/png;base64,901");
  h.frame(now = 99); assert.equal(h.target.src, "data:image/png;base64,901");
  h.frame(now = 100); assert.equal(h.target.src, "data:image/png;base64,902", "the native second frame must actually become visible");
  await h.skin.sync(h.root, {...h.pose});
  h.frame(now = 200); assert.equal(h.target.src, "data:image/png;base64,901", "stable native metadata cannot restart the animation clock");
  assert.deepEqual(h.loaded.filter(id => id < 1000), [901, 902]); assert.equal(h.peak(), 1);
  assert.ok(h.outputs.every(output => output.width <= 192 && output.height <= 176));
  const frames = h.outputs.filter(output => output.draws.some((draw: number[]) => draw.length === 4));
  assert.ok(frames.some(output => output.draws.some((draw: number[]) => draw[0] === 4 && draw[1] === 0)), "native frame offsets survive a shared model bounding box");
  h.skin.clearPortrait();
});

test("reduced motion, hidden documents and a cleared selection stop portrait playback", async t => {
  t.mock.method(performance, "now", () => 0);
  const h = animationHarness(); await h.skin.sync(h.root, h.pose);
  h.frame(100); assert.equal(h.target.src, "data:image/png;base64,902");
  h.motion.matches = true; h.motion.dispatchEvent(new Event("change"));
  assert.equal(h.target.src, "data:image/png;base64,901"); assert.equal(h.callbacks.size, 0);
  h.motion.matches = false; h.motion.dispatchEvent(new Event("change")); assert.equal(h.callbacks.size, 1);
  h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.callbacks.size, 0);
  h.doc.hidden = false; h.doc.dispatchEvent(new Event("visibilitychange")); assert.equal(h.callbacks.size, 1);
  const late = [...h.callbacks.values()][0]; h.skin.clearPortrait();
  assert.equal(h.callbacks.size, 0); late(100); assert.equal(h.callbacks.size, 0, "a late callback cannot resurrect a closed model");
});

test("an animation decoding during selection change cannot install the previous pet", async () => {
  const h = animationHarness(); let release!: () => void, reached!: () => void;
  const waiting = new Promise<void>(resolve => {reached = resolve;});
  const skin = new MobileNativeSkin({imageCanvas: async (id: number) => {
    if (id === 901) {reached(); await new Promise<void>(resolve => {release = resolve;});}
    return [{id, width: 80, height: 100, toDataURL: () => `data:image/png;base64,${id}`}, -40, -90];
  }} as any);
  const first = skin.sync(h.root, h.pose); await waiting;
  void skin.sync(h.root, {...h.pose, image: 903, animation: {key: "pet:two", ticks: 6, frames: [[903, 0, 0, 0], [904, 0, 0, 0]]}} as any);
  release(); await first; assert.equal(h.target.src, "data:image/png;base64,903");
  skin.clearPortrait();
});

test("long native animations have a bounded decoded frame budget and evict old models", async () => {
  const h = animationHarness();
  const pose = (base: number) => ({...h.pose, image: base, animation: {key: `pet:${base}`, ticks: 6,
    frames: Array.from({length: 96}, (_, i) => [base + i, 0, 0, 0])}} as any);
  await h.skin.sync(h.root, pose(1000));
  assert.ok(h.loaded.filter(id => id >= 1000 && id < 1096).length <= 32, "long actions cannot retain unlimited frame images");
  const count = h.loaded.length; await h.skin.sync(h.root, pose(1000)); assert.equal(h.loaded.length, count);
  await h.skin.sync(h.root, pose(2000)); await h.skin.sync(h.root, pose(3000));
  const before = h.loaded.length; await h.skin.sync(h.root, pose(1000)); assert.ok(h.loaded.length > before, "old animation assets must be evicted");
  assert.equal(h.peak(), 1); h.skin.clearPortrait();
});

test("repeated native frames reuse one decoded crop while retaining each frame offset", async () => {
  const h = animationHarness();
  h.pose.animation.frames = [[901, 0, 0, 0], [902, 0, 0, 0], [901, 4, -2, 0]];
  await h.skin.sync(h.root, h.pose);
  assert.deepEqual(h.loaded.filter(id => id < 1000), [901, 902], "a repeated native image cannot inflate its entire atlas twice");
  h.skin.clearPortrait();
});
