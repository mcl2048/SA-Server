// node --test client/test/assets-extension.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { Assets, ANIM } from "../src/assets.ts";
import type { AnimDef } from "../src/assets.ts";
import type { Renderer, Texture } from "../src/renderer.ts";

const root = "/assets/", extension = `${root}extensions/ai-pets-v1/`;
const sprites = [199100, 199101, 199102, 199103];
const manifest = () => ({ format: 1, id: "ai-pets-v1", pages: [{ file: "pages/00000.png", width: 64, height: 64 }],
  images: sprites.map((_, i) => [9000000 + i, 0, (i % 2) * 32, Math.floor(i / 2) * 32, 32, 32, -16, -30]),
  animations: sprites.map(id => ({ id, file: `anim/${id}.json` })) });
const animation = (id: number): AnimDef => ({ id, pages: ["untrusted/path"], actions: [{ dir: 0, type: ANIM.STAND, ticks: 6, frames: [[9000000 + sprites.indexOf(id), 0, 0, 0]] }] });
const baseAnimation = (id: number): AnimDef => ({ id, pages: ["i8/0"], actions: [{ dir: 0, type: ANIM.STAND, ticks: 6, frames: [[0, 0, 0, 0]] }] });
function binaryIndex(conflict = false) {
  const bytes: number[] = [];
  const u8 = (n: number) => bytes.push(n & 255);
  const u16 = (n: number) => { u8(n); u8(n >> 8); };
  const u32 = (n: number) => { u16(n); u16(n >>> 16); };
  u32(0x58494153); u32(1); u32(1); // SAIX, version, image chunks.
  u32(0); u32(1); u8(0); u8(0); for (const n of [0, 0, 0, 2, 2, -1, -2]) u16(n);
  const ids = [100374, 102166, ...(conflict ? [199100] : [])]; u32(ids.length);
  for (const id of ids) {
    u32(id); u16(1); u16(1); u8(0); u8(0); u16(0); // One i8 page, one action.
    u8(0); u8(ANIM.STAND); u16(6); u8(0); u8(0); u16(1);
    u32(0); u16(0); u16(0); u16(0); u16(0);
  }
  u32(1); u8(0); u8(0); u16(0); // One original core page.
  return gzipSync(Buffer.from(bytes));
}
type SetupOptions = { missing?: boolean; binary?: boolean; indexBytes?: Uint8Array; conflict?: boolean; mutate?: (pack: ReturnType<typeof manifest>) => void;
  primal?: boolean; badPrimal?: boolean; lilith?: boolean; badLilith?: boolean; lisarido?: boolean; badLisarido?: boolean;
  mutateAnim?: (anim: AnimDef) => void; texture?: (url: string) => Promise<Texture> };
const environments = new WeakSet<object>();
function setup(t: any, options: SetupOptions = {}) {
  const pack = manifest(); options.mutate?.(pack);
  const requests: string[] = [], loaded: { url: string; indexed: boolean }[] = [], deleted: Texture[] = [], warnings: unknown[][] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, _init: any) => {
    const url = String(input); requests.push(url);
    if (url === root + "extensions/primal-claws-v2/manifest.json") return options.primal ? Response.json({format:1,id:"primal-claws-v2",pages:[{file:"pages/00000.png",width:64,height:64}],images:[0,1,2].map(i=>[9300000+i,0,(i%2)*32,Math.floor(i/2)*32,32,32,-16,-30]),animations:[199400,199401,199402].map(id=>({id,file:`anim/${id}.json`}))}) : new Response(null,{status:404});
    const primal = /^\/assets\/extensions\/primal-claws-v2\/anim\/(19940[012])\.json$/.exec(url);
    if (primal) return Response.json({id:Number(primal[1]),pages:[],actions:[{dir:0,type:3,ticks:3,frames:[[options.badPrimal?9200000:9300000+Number(primal[1])-199400,0,0,0]]}]});
    if (url === root + "extensions/lisarido-v1/manifest.json") return options.lisarido ? Response.json({ format: 1, id: "lisarido-v1", pages: [{file:"pages/00000.png",width:64,height:64}], images: [[9200000,0,0,0,32,32,-16,-30],[9200001,0,32,0,32,32,-16,-30]], animations: [199300,199301].map(id=>({id,file:`anim/${id}.json`})) }) : new Response(null,{status:404});
    const lisarido = /^\/assets\/extensions\/lisarido-v1\/anim\/(19930[01])\.json$/.exec(url);
    if (lisarido) return Response.json({id:Number(lisarido[1]),pages:[],actions:[{dir:0,type:3,ticks:3,frames:[[options.badLisarido ? 9100000 : 9200000 + Number(lisarido[1])-199300,0,0,0]]}]});
    if (url === root + "extensions/lilith-v1/manifest.json") return options.lilith ? Response.json({ format: 1, id: "lilith-v1", pages: [{file:"pages/00000.png",width:64,height:64}], images: [[9100000,0,0,0,32,32,-16,-30],[9100001,0,32,0,32,32,-16,-30]], animations: [199200,199201].map(id=>({id,file:`anim/${id}.json`})) }) : new Response(null,{status:404});
    const lilith = /^\/assets\/extensions\/lilith-v1\/anim\/(19920[01])\.json$/.exec(url);
    if (lilith) return Response.json({id:Number(lilith[1]),pages:[],actions:[{dir:0,type:3,ticks:3,frames:[[options.badLilith ? 9000000 : 9100000 + Number(lilith[1])-199200,0,0,0]]}]});
    if (url === root + "manifest.json") return Response.json({ format: 1, chunkShift: 12, pageFormat: "webp", palettes: 16, imageChunks: [0] });
    if (url === root + "tiles.json") return Response.json({ tiles: [[29025, 0, 1, 1, 0]] });
    if (url === root + "index.bin.gz") return options.binary === false ? new Response(null, { status: 404 }) : new Response(options.indexBytes ?? binaryIndex(options.conflict));
    if (url === extension + "manifest.json") return options.missing ? new Response(null, { status: 404 }) : Response.json(pack);
    if (url === root + "images/0000.json") return Response.json({ img: [[0, 0, 0, 0, 2, 2, -1, -2]] });
    const original = /^\/assets\/anim\/(100374|102166)\.json$/.exec(url);
    if (original) return Response.json(baseAnimation(Number(original[1])));
    const anim = /^\/assets\/extensions\/ai-pets-v1\/anim\/(19910[0-3])\.json$/.exec(url);
    if (anim) { const value = animation(Number(anim[1])); options.mutateAnim?.(value); return Response.json(value); }
    if (url.startsWith(extension + "pages/")) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error("Unexpected fetch " + url);
  };
  const originalWarn = console.warn; console.warn = (...args) => { warnings.push(args); };
  if (!environments.has(t)) {
    environments.add(t);
    t.after(() => { globalThis.fetch = originalFetch; console.warn = originalWarn; });
  }
  const renderer = { loadTexture: async (url: string, indexed: boolean) => {
    loaded.push({ url, indexed });
    if (url.startsWith(extension) && options.texture) return options.texture(url);
    return { tex: {} as WebGLTexture, indexed, w: url.includes("/extensions/") ? 64 : 2, h: url.includes("/extensions/") ? 64 : 2 };
  }, deleteTexture: (tex: Texture) => { deleted.push(tex); }, setPalette: (_tex: Texture) => {} };
  const assets = new Assets(root, renderer as unknown as Renderer);
  return { assets, requests, loaded, deleted, warnings, pack };
}
async function pending(assets: Assets) { for (let i = 0; assets.pending && i < 30; i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(assets.pending, 0); }

test("overlay registers independent RGBA image IDs and animations without changing SAIX or core pages", async t => {
  const { assets, requests, loaded } = setup(t); await assets.init();
  assert.deepEqual(assets.image(0), { set: 0, page: 0, x: 0, y: 0, w: 2, h: 2, ox: -1, oy: -2 });
  assert.equal(assets.tile(29025), 0); assert.equal(assets.paletteCount, 16); assert.equal(assets.pageFormat, "webp"); assert.equal(assets.coreCount, 1);
  const ext = assets.image(9000000)!; assert.equal(ext.set, 2); assert.equal(ext.page, 0); assert.equal(ext.ox, -16);
  for (const id of sprites) { const anim = assets.anim(id)!; assert.equal(anim.id, id); assert.deepEqual(anim.pages, ["ai-pets-v1/0"]); assert.equal(anim.actions[0].frames[0][0], 9000000 + sprites.indexOf(id)); }
  assert.equal(assets.gpuBytes, 64 * 64 * 4); assert.equal(assets.pageCount, 1);
  await assets.preloadCore(() => {}); assert.ok(loaded.some(r => r.url === root + "pages/i8/00000.webp" && r.indexed));
  assert.ok(loaded.some(r => r.url === extension + "pages/00000.png" && !r.indexed));
  assert.ok(!requests.some(r => /images\/2197|anim\/19910[0-3]\.json$/.test(r) && !r.startsWith(extension)));
});

test("Lilith and mechanical extensions keep independent images, GPU pages and eviction reload URLs", async t => {
  const {assets,loaded}=setup(t,{lilith:true}); await assets.init();
  assert.equal(assets.anim(199200)?.id,199200); assert.equal(assets.anim(199201)?.id,199201);
  assert.equal(assets.image(9100000)?.set,3); assert.equal(assets.image(9000000)?.set,2);
  assert.equal(assets.gpuBytes,2*64*64*4);
  assets.gpuBudget=1; for(let i=0;i<150;i++)assets.tick(); assert.equal(assets.gpuBytes,0);
  assets.anim(199200); await pending(assets);
  assert.equal(assets.gpuBytes,64*64*4);
  assert.equal(loaded.filter(x=>x.url===root+"extensions/lilith-v1/pages/00000.png").length,2);
  assert.equal(loaded.filter(x=>x.url===extension+"pages/00000.png").length,1);
});

test("a malformed Lilith frame cannot claim another pack's images or roll back mechanical pets",async t=>{
  const {assets,warnings}=setup(t,{lilith:true,badLilith:true});await assets.init();
  assert.equal(assets.image(9100000),null);assert.equal(assets.anim(199100)?.id,199100);
  assert.equal(assets.image(9000000)?.set,2);assert.equal(warnings.length,1);
});

test("Lisarido owns independent set4 pages and reloads them after eviction without replacing Lilith",async t=>{
  const {assets,loaded}=setup(t,{lilith:true,lisarido:true});await assets.init();
  assert.equal(assets.anim(199300)?.id,199300);assert.equal(assets.anim(199301)?.id,199301);
  assert.equal(assets.image(9200000)?.set,4);assert.equal(assets.image(9100000)?.set,3);assert.equal(assets.image(9000000)?.set,2);
  assets.gpuBudget=1;for(let i=0;i<150;i++)assets.tick();assert.equal(assets.gpuBytes,0);
  assets.anim(199300);await pending(assets);
  assert.equal(loaded.filter(x=>x.url===root+"extensions/lisarido-v1/pages/00000.png").length,2);
  assert.equal(loaded.filter(x=>x.url===root+"extensions/lilith-v1/pages/00000.png").length,1);
});

test("an invalid Lisarido frame cannot borrow Lilith images or suppress the other independent packs",async t=>{
  const {assets,warnings}=setup(t,{lilith:true,lisarido:true,badLisarido:true});await assets.init();
  assert.equal(assets.image(9200000),null);assert.equal(assets.anim(199300)?.id,100374);
  assert.equal(assets.anim(199200)?.id,199200);assert.equal(assets.anim(199100)?.id,199100);assert.equal(warnings.length,1);
});

test("a missing optional pack silently uses existing mechanical animations and never requests extension sprite JSON repeatedly", async t => {
  const { assets, requests, warnings } = setup(t, { missing: true }); await assets.init();
  for (let n = 0; n < 50; n++) for (const id of sprites) assert.ok([100374, 102166].includes(assets.anim(id)!.id));
  assert.equal(assets.image(9000000), null); assert.equal(warnings.length, 0);
  assert.equal(requests.filter(r => r === extension + "manifest.json").length, 1);
  assert.ok(!requests.some(r => r.includes("/anim/199")));
});

test("missing-pack fallbacks resolve actual frame images in the original local asset index when available", async t => {
  const path = new URL("../../assets/index.bin.gz", import.meta.url);
  if (!existsSync(path)) { t.skip("official resource pack is distributed separately"); return; }
  const { assets } = setup(t, { missing: true, indexBytes: readFileSync(path) });
  await assets.init();
  for (const id of sprites) {
    const anim = assets.anim(id); assert.ok(anim, `fallback for ${id} must exist in the original index`);
    assert.equal(anim.id, 100374); assert.ok(anim.actions.length);
    for (const action of anim.actions) for (const frame of action.frames) assert.ok(assets.image(frame[0]), `fallback frame ${frame[0]} is missing`);
  }
});

test("the generated four-pet pack resolves every real atlas frame when installed", async t => {
  const packRoot = new URL("../../assets/extensions/ai-pets-v1/", import.meta.url);
  const path = new URL("manifest.json", packRoot);
  if (!existsSync(path)) { t.skip("generated extension artwork is not installed"); return; }
  const original = new URL("../../assets/index.bin.gz", import.meta.url);
  const env = setup(t, { indexBytes: existsSync(original) ? readFileSync(original) : undefined, texture: async url => {
    const data = readFileSync(new URL(url.slice(extension.length), packRoot));
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(data[24], 8); assert.equal(data[25], 6, "atlases must retain RGBA transparency");
    return { tex: {} as WebGLTexture, indexed: false, w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
  } });
  const stub = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any) => {
    const url = String(input);
    if (url.startsWith(extension)) {
      const file = new URL(url.slice(extension.length), packRoot);
      return existsSync(file) ? Response.json(JSON.parse(readFileSync(file, "utf8"))) : new Response(null, { status: 404 });
    }
    return stub(input, init);
  };
  await env.assets.init(); assert.equal(env.warnings.length, 0); assert.equal(env.assets.pageCount, 4);
  for (const id of sprites) {
    const anim = env.assets.anim(id); assert.ok(anim); assert.equal(anim.id, id);
    let frames = 0;
    for (let dir = 0; dir < 8; dir++) for (const type of Object.values(ANIM)) {
      const action = anim.actions.find(action => action.dir === dir && action.type === type);
      assert.ok(action, `${id} needs direction ${dir}, action ${type}`);
      for (const frame of action.frames) { const image = env.assets.image(frame[0]); assert.ok(image); assert.equal(image.set, 2); frames++; }
    }
    assert.ok(frames >= 192, `${id} needs the complete multi-pose animation set`);
  }
});

test("JSON fallback mode also supports the overlay and deduplicates missing-pack original animation requests", async t => {
  const { assets, requests } = setup(t, { missing: true, binary: false }); await assets.init();
  for (let n = 0; n < 20; n++) assert.equal(assets.anim(199100), null);
  await pending(assets); assert.equal(assets.anim(199100)!.id, 100374);
  assert.equal(requests.filter(r => r === root + "anim/100374.json").length, 1);
  assert.equal(assets.image(0), null); await pending(assets); assert.equal(assets.image(0)!.w, 2);
});

test("a complete overlay loads independently when the original binary index is unavailable", async t => {
  const { assets } = setup(t, { binary: false }); await assets.init();
  assert.equal(assets.anim(199103)!.id, 199103); assert.equal(assets.image(9000003)!.set, 2);
});

test("invalid image bounds, foreign IDs and unsafe relative paths reject atomically before loading any extension texture", async t => {
  for (const mutate of [
    (m: ReturnType<typeof manifest>) => { m.images[0][4] = 65; },
    (m: ReturnType<typeof manifest>) => { m.images[0][0] = 0; },
    (m: ReturnType<typeof manifest>) => { m.pages[0].file = "../palettes.png"; },
    (m: ReturnType<typeof manifest>) => { m.pages[0].file = "pages/%2e%2e.png"; },
    (m: ReturnType<typeof manifest>) => { m.images.push(m.images[0]); },
    (m: ReturnType<typeof manifest>) => { m.animations[0].id = 100374; },
  ]) {
    const env = setup(t, { mutate }); await env.assets.init();
    assert.equal(env.assets.image(9000000), null); assert.equal(env.assets.anim(199100)!.id, 100374);
    assert.equal(env.loaded.filter(r => r.url.startsWith(extension)).length, 0); assert.equal(env.warnings.length, 1);
  }
});

test("malformed frames, duplicate actions and original sprite collisions preserve all original resources", async t => {
  for (const mutateAnim of [
    (a: AnimDef) => { a.actions[0].frames[0][0] = 123; },
    (a: AnimDef) => { a.actions[0].ticks = 0; },
    (a: AnimDef) => { a.actions.push(a.actions[0]); },
  ]) {
    const env = setup(t, { mutateAnim }); await env.assets.init(); assert.equal(env.assets.image(9000000), null); assert.equal(env.assets.anim(199100)!.id, 100374);
  }
  const { assets } = setup(t, { conflict: true }); await assets.init();
  assert.equal(assets.image(9000000), null); assert.equal(assets.anim(199100)!.id, 199100); assert.equal(assets.image(0)!.w, 2);
});

test("failed atlas decoding rolls back successfully decoded sibling textures before falling back", async t => {
  let count = 0;
  const { assets, deleted } = setup(t, {
    mutate: m => { m.pages.push({ file: "pages/broken.png", width: 64, height: 64 }); },
    texture: async url => { if (url.endsWith("broken.png")) throw Error("bad PNG"); count++; return { tex: {} as WebGLTexture, indexed: false, w: 64, h: 64 }; },
  }); await assets.init();
  assert.equal(count, 1); assert.equal(deleted.length, 1); assert.equal(assets.gpuBytes, 0); assert.equal(assets.pageCount, 0);
  assert.equal(assets.image(9000000), null); assert.equal(assets.anim(199100)!.id, 100374);
});

test("a page with unexpected decoded dimensions is disposed and cannot partially register sprites", async t => {
  const { assets, deleted } = setup(t, { texture: async () => ({ tex: {} as WebGLTexture, indexed: false, w: 32, h: 64 }) });
  await assets.init(); assert.equal(deleted.length, 1); assert.equal(assets.gpuBytes, 0); assert.equal(assets.anim(199101)!.id, 100374);
});

test("extension textures follow the GPU eviction budget and reload from their own PNG paths", async t => {
  const { assets, loaded, deleted } = setup(t); await assets.init(); assets.gpuBudget = 1;
  for (let n = 0; n < 150; n++) assets.tick();
  assert.equal(assets.gpuBytes, 0); assert.equal(deleted.length, 1);
  assert.equal(assets.anim(199100)!.id, 199100); await pending(assets);
  assert.equal(assets.gpuBytes, 64 * 64 * 4); assert.equal(loaded.filter(r => r.url === extension + "pages/00000.png").length, 2);
  assert.equal(assets.page(2, 500), null); assert.ok(!loaded.some(r => r.url.includes("undefined")));
});

test("extension deadline disposes decoded textures immediately and also disposes late arrivals", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finishLate!: (texture: Texture) => void;
  const { assets, loaded, deleted, warnings } = setup(t, {
    mutate: m => { m.pages.push({ file: "pages/slow.png", width: 64, height: 64 }); },
    texture: async url => url.endsWith("slow.png") ? new Promise<Texture>(resolve => { finishLate = resolve; }) : { tex: {} as WebGLTexture, indexed: false, w: 64, h: 64 },
  });
  const ready = assets.init();
  for (let n = 0; !finishLate && n < 100; n++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(finishLate, "atlas requests should have started");
  assert.equal(loaded.filter(row => row.url.startsWith(extension)).length, 2);
  t.mock.timers.tick(5000); await ready;
  assert.equal(deleted.length, 1); assert.equal(assets.gpuBytes, 0); assert.equal(warnings.length, 1);
  assert.equal(assets.anim(199100)!.id, 100374);
  finishLate({ tex: {} as WebGLTexture, indexed: false, w: 64, h: 64 });
  for (let n = 0; deleted.length < 2 && n < 10; n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(deleted.length, 2); assert.equal(assets.image(9000000), null);
});

test("imageCanvas rawIndex decodes a small animation frame while default calls retain map-number conversion", async t => {
  const { assets } = setup(t, { missing: true }); await assets.init();
  assert.equal(await assets.imageCanvas(0), null, "zero is not a map number even though raw image zero exists");
  const globals = new Map<string, PropertyDescriptor | undefined>(), requests: string[] = [], output: ImageData[] = [];
  const stub = globalThis.fetch; let closed = 0;
  globalThis.fetch = async (input: any, init: any) => {
    const url = String(input);
    if (url === root + "pages/i8/00000.webp" || url === root + "palettes.png") { requests.push(url); return new Response(url.endsWith("palettes.png") ? "palette" : "indexed"); }
    return stub(input, init);
  };
  const replacements = {
    createImageBitmap: async (blob: Blob) => { const kind = await blob.text(); return { kind, width: kind === "palette" ? 256 : 2, height: kind === "palette" ? 1 : 2, close() { this.width = 0; this.height = 0; closed++; } }; },
    OffscreenCanvas: class {
      width: number; height: number; kind = "";
      constructor(w: number, h: number) { this.width = w; this.height = h; }
      getContext() { return {
        drawImage: (bitmap: any) => { this.kind = bitmap.kind; },
        getImageData: (_x: number, _y: number, w: number, h: number) => { assert.equal(w, this.width); assert.equal(h, this.height); assert.ok(w > 0 && h > 0); const data = new Uint8ClampedArray(this.width * this.height * 4);
          if (this.kind === "palette") data.set([10, 20, 30, 255], 4);
          else { data[4] = 1; data[8] = 1; data[12] = 1; }
          return { width: this.width, height: this.height, data };
        },
      }; }
    },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (image: ImageData) => { output.push(image); } }) }) },
  };
  for (const [key, value] of Object.entries(replacements)) { globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); }
  t.after(() => { for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const raw = await assets.imageCanvas(0, true), mapped = await assets.imageCanvas(29025);
  for (const canvas of [raw, mapped]) { assert.ok(canvas); assert.equal(canvas[0].width, 2); assert.equal(canvas[0].height, 2); assert.deepEqual(canvas.slice(1), [-1, -2]); }
  assert.deepEqual([...output[0].data], [0, 0, 0, 0, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255]);
  assert.deepEqual(output[0].data, output[1].data); assert.equal(closed, 4);
  assert.equal(requests.filter(url => url.endsWith("pages/i8/00000.webp")).length, 2);
  assert.equal(requests.filter(url => url.endsWith("palettes.png")).length, 2);
});

test("imageCanvas decodes high extension IDs with RGBA transparency and anchors without palette lookup", async t => {
  const { assets, requests } = setup(t); await assets.init();
  const globals = new Map<string, PropertyDescriptor | undefined>(); let result: ImageData | undefined, closed = 0;
  const replacements = {
    createImageBitmap: async () => ({ width: 64, height: 64, close() { this.width = 0; this.height = 0; closed++; } }),
    OffscreenCanvas: class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; }
      getContext() { return { drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => {
        assert.equal(w, 64); assert.equal(h, 64);
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => i % 251) };
      } }; } },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (image: ImageData) => { result = image; } }) }) },
  };
  for (const [key, value] of Object.entries(replacements)) { globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); }
  t.after(() => { for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  for (const rawIndex of [false, true]) {
    const canvas = await assets.imageCanvas(9000001, rawIndex); assert.ok(canvas); assert.equal(canvas[0].width, 32); assert.deepEqual(canvas.slice(1), [-16, -30]);
    assert.deepEqual([...result!.data.slice(0, 4)], [128, 129, 130, 131]);
  }
  assert.equal(closed, 2);
  assert.equal(requests.filter(url => url === root + "palettes.png").length, 0);
  assert.equal(requests.filter(url => url === extension + "pages/00000.png").length, 2);
});

 test("primal pets and claw effects own independent set5 pages that reload after eviction",async t=>{
 const {assets,loaded}=setup(t,{lilith:true,lisarido:true,primal:true});await assets.init();
 for(const id of [199400,199401,199402])assert.equal(assets.anim(id)?.id,id);
 assert.equal(assets.image(9300000)?.set,5);assert.equal(assets.image(9200000)?.set,4);
 assets.gpuBudget=1;for(let i=0;i<150;i++)assets.tick();assert.equal(assets.gpuBytes,0);
 assets.anim(199401);await pending(assets);
 assert.equal(loaded.filter(p=>p.url===root+"extensions/primal-claws-v2/pages/00000.png").length,2);
 assert.equal(loaded.filter(p=>p.url===root+"extensions/lisarido-v1/pages/00000.png").length,1);
 });
 test("invalid primal frames cannot borrow a previous extension's images",async t=>{
 const {assets,warnings}=setup(t,{lisarido:true,primal:true,badPrimal:true});await assets.init();
 assert.equal(assets.image(9300000),null);assert.equal(assets.anim(199400)?.id,100374);
 assert.equal(assets.anim(199300)?.id,199300);assert.equal(warnings.length,1);
 });
