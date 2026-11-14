// 按需加载导出资源（格式见 h5/CLAUDE.md 的"资源格式规格"第 10 节）。
// 取图接口是同步的：数据没到就返回 null 并在后台开始加载，下一帧再画。

import type { Renderer, Texture } from "./renderer.ts";

export interface ImageEntry { set: number; page: number; x: number; y: number; w: number; h: number; ox: number; oy: number; }
export interface AnimAction { dir: number; type: number; ticks: number; freeze?: number; frames: [number, number, number, number][]; }
export interface AnimDef { id: number; actions: AnimAction[]; pages: string[]; }

export const ANIM = { ATTACK: 0, DAMAGE: 1, DEAD: 2, STAND: 3, WALK: 4, HAND: 6, GUARD: 10, THROW: 12 }; // loadsprbin.h ANIM_LIST
const SETS = ["i8", "rgba"];

// Extensions never enter the legacy SAIX index: its page/set fields are compact
// integers and assetindex intentionally only understands the original two sets.
const AI_PETS = { id: "ai-pets-v1", set: 2, imageBase: 9000000, imageLimit: 9100000, sprites: [199100, 199101, 199102, 199103] };
const LILITH = { id: "lilith-v1", set: 3, imageBase: 9100000, imageLimit: 9200000, sprites: [199200, 199201] };
const LISARIDO = { id: "lisarido-v1", set: 4, imageBase: 9200000, imageLimit: 9300000, sprites: [199300, 199301] };
const PRIMAL_CLAWS = { id: "primal-claws-v2", set: 5, imageBase: 9300000, imageLimit: 9400000, sprites: [199400, 199401, 199402] };
type ExtensionPack = typeof AI_PETS;
interface ExtensionPage { file: string; width: number; height: number; }
interface ExtensionManifest {
  format: 1; id: string;
  pages: ExtensionPage[];
  // [image ID, local page, x, y, width, height, anchor x, anchor y]
  images: number[][];
  animations: { id: number; file: string }[];
}
const integer = (n: unknown, low: number, high: number): n is number => Number.isInteger(n) && Number(n) >= low && Number(n) <= high;
// Existing mechanical sprites keep pets visible with the unmodified asset pack.
const AI_PET_FALLBACK = new Map([...AI_PETS.sprites.map(id => [id, 100374] as [number, number]), [199200, 100374], [199201, 101735], [199300, 100374], [199301, 101735], [199400, 100374], [199401, 100374], [199402, 101735]]);

// 显存里的图集页：没用了很久、总量超过 gpuBudget 时先释放（core 是登录前预加载的界面页，不释放）
interface PageSlot { tex: Texture | null; used: number; core: boolean; }

export class Assets {
  private manifest: any;
  private chunks = new Map<number, (number[] | 0)[] | null>();
  private pages = new Map<string, PageSlot>();
  private anims = new Map<number, AnimDef | null>();
  private extensionImages = new Map<number, ImageEntry>();
  private extensionPageUrls = new Map<string, string>();
  private extensionAnims = new Map<number, number>();
  private tileIndex = new Map<number, number>(); // 地图图号 → 图像索引
  private tileSize = new Map<number, [number, number]>(); // 地图图号 → 占地格数 [x, y]（adrn atari）
  private tileFlat = new Set<number>(); // 地图图号：贴地的可走物件（adrn hit 的百位 = 3，map.cpp checkPrioPartsVsChar：永远画在角色下面，如桥、地毯）
  private root: string;
  private renderer: Renderer;
  pending = 0;
  // 二进制索引（server/tools/assetindex 产生的 index.bin.gz）：图像清单与动画都在这里，读进来之后不必再请求
  private index: DataView | null = null;
  private imgChunks = new Map<number, [number, number]>(); // 块号 → [偏移, 个数]
  private animAt = new Map<number, number>();              // 动画编号 → 偏移
  private corePages: [number, number][] = [];
  // 显存：每帧 tick() 一次；超过预算就把 120 帧（约 2 秒）没用过的页释放，从最久没用的开始
  private frameNo = 0;
  gpuBytes = 0;
  gpuBudget = 512 * 1024 * 1024;

  constructor(root: string, renderer: Renderer) {
    this.root = root;
    this.renderer = renderer;
  }

  /** 启动时：manifest、地图图号表、调色板、二进制索引（progress 是 0..1 的下载进度） */
  async init(progress: (p: number) => void = () => {}) {
    this.manifest = await (await fetch(this.root + "manifest.json")).json();
    const t = await (await fetch(this.root + "tiles.json")).json();
    for (const r of t.tiles as number[][]) {
      this.tileIndex.set(r[0], r[1]);
      if (r[2] > 1 || r[3] > 1) this.tileSize.set(r[0], [r[2], r[3]]);
      if (r[4] % 100 !== 0 && Math.floor(r[4] / 100) === 3) this.tileFlat.add(r[0]);
    }
    this.renderer.setPalette(await this.renderer.loadTexture(this.root + "palettes.png", false));
    try { await this.loadIndex(progress); } catch (e) { console.warn("没有二进制索引，改用逐个 JSON", e); this.index = null; }
    await Promise.all([AI_PETS, LILITH, LISARIDO, PRIMAL_CLAWS].map(pack => this.loadOptionalExtension(pack)));
  }

  /** Missing/invalid add-ons leave the original resource set fully usable. */
  private async loadOptionalExtension(pack: ExtensionPack) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.loadExtension(pack, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("扩展资源读取超时")); }, 5000); }),
      ]);
    } catch (error) {
      controller.abort();
      console.warn(`${pack.id}扩展不可用，保留原资源`, error);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  private async loadExtension(pack: ExtensionPack, signal: AbortSignal) {
    const base = `${this.root}extensions/${pack.id}/`;
    const response = await fetch(base + "manifest.json", { signal });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`扩展清单: ${response.status}`);
    const manifest = await response.json() as ExtensionManifest;
    if (manifest.format !== 1 || manifest.id !== pack.id || !Array.isArray(manifest.pages) || manifest.pages.length < 1 || manifest.pages.length > 16
      || !Array.isArray(manifest.images) || manifest.images.length < 1 || manifest.images.length > 10000
      || !Array.isArray(manifest.animations) || manifest.animations.length !== pack.sprites.length) throw new Error("扩展清单格式无效");
    let pixels = 0;
    const pageFiles = new Set<string>();
    for (const page of manifest.pages) {
      if (!page || typeof page.file !== "string" || !/^pages\/[A-Za-z0-9_-]+\.png$/.test(page.file)
        || pageFiles.has(page.file) || !integer(page.width, 1, 4096) || !integer(page.height, 1, 4096)) throw new Error("扩展纹理页无效");
      pixels += page.width * page.height; pageFiles.add(page.file);
    }
    if (pixels > 32 * 1024 * 1024) throw new Error("扩展纹理页过大");
    const images = new Map<number, ImageEntry>();
    for (const row of manifest.images) {
      if (!Array.isArray(row) || row.length !== 8 || !integer(row[0], pack.imageBase, pack.imageLimit - 1)
        || images.has(row[0]) || !integer(row[1], 0, manifest.pages.length - 1)
        || !row.slice(2, 6).every(n => integer(n, 0, 4096)) || row[4] < 1 || row[5] < 1
        || !row.slice(6).every(n => integer(n, -32768, 32767))) throw new Error("扩展图像无效");
      const [id, page, x, y, w, h, ox, oy] = row, size = manifest.pages[page];
      if (x + w > size.width || y + h > size.height || this.hasBaseImage(id)) throw new Error("扩展图像越界或编号冲突");
      images.set(id, { set: pack.set, page, x, y, w, h, ox, oy });
    }
    const spriteIds = new Set<number>();
    for (const entry of manifest.animations) {
      if (!entry || !pack.sprites.includes(entry.id) || spriteIds.has(entry.id)
        || entry.file !== `anim/${entry.id}.json` || this.animAt.has(entry.id)) throw new Error("扩展动画编号无效或冲突");
      spriteIds.add(entry.id);
    }
    const animations = await Promise.all(manifest.animations.map(async entry => {
      const response = await fetch(base + entry.file, { signal });
      if (!response.ok) throw new Error(`扩展动画: ${response.status}`);
      const anim = await response.json() as AnimDef;
      if (anim.id !== entry.id || !Array.isArray(anim.actions) || !anim.actions.length || anim.actions.length > 256) throw new Error("扩展动画格式无效");
      const pages = new Set<number>(), actions = new Set<string>();
      for (const action of anim.actions) {
        if (!action || !integer(action.dir, 0, 7) || !integer(action.type, 0, 255) || !integer(action.ticks, 1, 600)
          || (action.freeze !== undefined && !integer(action.freeze, 0, 255))
          || !Array.isArray(action.frames) || !action.frames.length || action.frames.length > 1000
          || actions.has(`${action.dir}/${action.type}`)) throw new Error("扩展动作无效");
        actions.add(`${action.dir}/${action.type}`);
        for (const frame of action.frames) {
          if (!Array.isArray(frame) || frame.length !== 4 || !images.has(frame[0])
            || !frame.slice(1, 3).every(n => integer(n, -32768, 32767)) || !integer(frame[3], 0, 65535)) throw new Error("扩展动画帧无效");
          pages.add(images.get(frame[0])!.page);
        }
      }
      // Derive this list rather than trusting paths supplied by the add-on.
      anim.pages = [...pages].sort((a, b) => a - b).map(page => `${pack.id}/${page}`);
      return anim;
    }));
    // Register the complete pack only once its atlas pages have decoded. A late
    // texture completion after timeout is disposed instead of leaking GPU memory.
    const loaded: Texture[] = [];
    const releaseLoaded = () => { for (const texture of loaded) this.renderer.deleteTexture(texture); loaded.length = 0; };
    signal.addEventListener("abort", releaseLoaded, { once: true });
    const textures = await Promise.allSettled(manifest.pages.map(async page => {
      const texture = await this.renderer.loadTexture(base + page.file, false);
      if (signal.aborted) { this.renderer.deleteTexture(texture); throw new Error("扩展读取已取消"); }
      if (texture.w !== page.width || texture.h !== page.height || texture.indexed) {
        this.renderer.deleteTexture(texture); throw new Error("扩展纹理尺寸不符");
      }
      loaded.push(texture);
      return texture;
    }));
    signal.removeEventListener("abort", releaseLoaded);
    if (signal.aborted || textures.some(result => result.status === "rejected")) {
      releaseLoaded();
      throw new Error("扩展纹理加载失败");
    }
    for (const [id, image] of images) this.extensionImages.set(id, image);
    for (let page = 0; page < manifest.pages.length; page++) {
      const key = `${pack.set}/${page}`, slot: PageSlot = { tex: null, used: this.frameNo, core: false };
      this.extensionPageUrls.set(key, base + manifest.pages[page].file);
      this.pages.set(key, slot);
      this.setTexture(slot, (textures[page] as PromiseFulfilledResult<Texture>).value);
    }
    for (const anim of animations) { this.anims.set(anim.id, anim); this.extensionAnims.set(anim.id, pack.set); }
  }

  private hasBaseImage(id: number): boolean {
    const shift = this.manifest.chunkShift, chunk = id >>> shift;
    if (!this.index) return this.manifest.imageChunks?.includes(chunk) ?? false;
    const entry = this.imgChunks.get(chunk), offset = id - (chunk << shift);
    return !!entry && offset >= 0 && offset < entry[1] && this.index.getUint8(entry[0] + offset * 16) !== 255;
  }

  private async loadIndex(progress: (p: number) => void) {
    const res = await fetch(this.root + "index.bin.gz");
    if (!res.ok || !res.body) throw new Error(`index.bin.gz: ${res.status}`);
    const total = Number(res.headers.get("Content-Length") ?? 0);
    let got = 0;
    const counted = res.body.pipeThrough(new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(chunk, ctl) { got += chunk.byteLength; if (total) progress(got / total); ctl.enqueue(chunk); },
    }));
    const buf = await new Response(counted.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint32(0, true) !== 0x58494153) throw new Error("index.bin.gz 格式不对"); // "SAIX"
    let o = 8;
    const chunks = v.getUint32(o, true); o += 4;
    for (let i = 0; i < chunks; i++) {
      const c = v.getUint32(o, true), n = v.getUint32(o + 4, true);
      this.imgChunks.set(c, [o + 8, n]);
      o += 8 + n * 16;
    }
    const anims = v.getUint32(o, true); o += 4;
    for (let i = 0; i < anims; i++) {
      this.animAt.set(v.getUint32(o, true), o);
      const pages = v.getUint16(o + 4, true), acts = v.getUint16(o + 6, true);
      o += 8 + pages * 4;
      for (let k = 0; k < acts; k++) o += 8 + v.getUint16(o + 6, true) * 12;
    }
    const core = v.getUint32(o, true); o += 4;
    for (let i = 0; i < core; i++, o += 4) this.corePages.push([v.getUint8(o), v.getUint16(o + 2, true)]);
    this.index = v;
  }

  /** 登录前把核心页（界面、登录画面、选形象用的角色）传进显存；progress 是 0..1 */
  async preloadCore(progress: (p: number) => void) {
    let done = 0, next = 0;
    const list = this.corePages;
    const worker = async () => {
      while (next < list.length) {
        const [set, page] = list[next++];
        const key = `${set}/${page}`;
        const slot: PageSlot = { tex: null, used: 0, core: true };
        this.pages.set(key, slot);
        try { this.setTexture(slot, await this.renderer.loadTexture(this.pageUrl(set, page), set === 0)); } catch { this.pages.delete(key); }
        progress(++done / list.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  get coreCount() { return this.corePages.length; }
  get paletteCount(): number { return this.manifest.palettes; }
  get pageFormat(): string { return this.manifest.pageFormat ?? "png"; }

  /** 地图图号 → 图像索引 */
  tile(mapNumber: number): number | undefined { return this.tileIndex.get(mapNumber); }

  /** 物件的占地：从锚点向 +x 展开 tx 格、向 −y 展开 ty 格 */
  footprint(mapNumber: number): [number, number] { return this.tileSize.get(mapNumber) ?? [1, 1]; }

  /** 贴地的可走物件（桥、地毯）：跟地面一起画，不参与和角色的遮挡排序 */
  flat(mapNumber: number): boolean { return this.tileFlat.has(mapNumber); }

  image(id: number): ImageEntry | null {
    const extension = this.extensionImages.get(id);
    if (extension) return extension;
    const shift = this.manifest.chunkShift, c = id >>> shift;
    if (this.index) {
      const ch = this.imgChunks.get(c), i = id - (c << shift);
      if (!ch || i < 0 || i >= ch[1]) return null;
      const v = this.index, o = ch[0] + i * 16;
      if (v.getUint8(o) === 255) return null;
      return { set: v.getUint8(o), page: v.getInt16(o + 2, true), x: v.getInt16(o + 4, true), y: v.getInt16(o + 6, true),
        w: v.getInt16(o + 8, true), h: v.getInt16(o + 10, true), ox: v.getInt16(o + 12, true), oy: v.getInt16(o + 14, true) };
    }
    const chunk = this.chunks.get(c);
    if (chunk === undefined) {
      this.chunks.set(c, null);
      this.load(fetch(`${this.root}images/${String(c).padStart(4, "0")}.json`).then((r) => r.json()).then((j) => { this.chunks.set(c, j.img); }));
      return null;
    }
    if (chunk === null) return null;
    const e = chunk[id - (c << shift)];
    return e ? { set: e[0], page: e[1], x: e[2], y: e[3], w: e[4], h: e[5], ox: e[6], oy: e[7] } : null;
  }

  private pageUrl(set: number, page: number) {
    const extension = this.extensionPageUrls.get(`${set}/${page}`);
    if (extension) return extension;
    return `${this.root}pages/${SETS[set]}/${String(page).padStart(5, "0")}.${this.manifest.pageFormat ?? "png"}`;
  }

  private setTexture(slot: PageSlot, tex: Texture) {
    slot.tex = tex;
    this.gpuBytes += tex.w * tex.h * (tex.indexed ? 1 : 4);
  }

  page(set: number, page: number): Texture | null {
    const key = `${set}/${page}`;
    if (set >= SETS.length && !this.extensionPageUrls.has(key)) return null;
    const s = this.pages.get(key);
    if (s) { s.used = this.frameNo; return s.tex; }
    const slot: PageSlot = { tex: null, used: this.frameNo, core: false };
    this.pages.set(key, slot);
    this.load(this.renderer.loadTexture(this.pageUrl(set, page), set === 0).then((tex) => {
      if (this.pages.get(key) === slot) this.setTexture(slot, tex); else this.renderer.deleteTexture(tex);
    }));
    return null;
  }

  /**
   * 每帧一次：超过显存预算时，把不是核心页、120 帧没用过的页从最久没用的开始释放，降到预算的 90%。
   * 释放的页下次要用时再读（浏览器缓存里有，不经服务器）。
   */
  tick() {
    this.frameNo++;
    if (this.gpuBytes <= this.gpuBudget || this.frameNo % 30 !== 0) return;
    const old = [...this.pages.entries()].filter(([, s]) => s.tex && !s.core && this.frameNo - s.used > 120).sort((a, b) => a[1].used - b[1].used);
    for (const [key, s] of old) {
      if (this.gpuBytes <= this.gpuBudget * 0.9) break;
      const t = s.tex!;
      this.gpuBytes -= t.w * t.h * (t.indexed ? 1 : 4);
      this.renderer.deleteTexture(t);
      this.pages.delete(key);
    }
  }

  /** 显存里有几张图集页（?debug 显示用） */
  get pageCount() { let n = 0; for (const s of this.pages.values()) if (s.tex) n++; return n; }

  /**
   * 把一张图解码成 RGBA（不经 WebGL，供 CSS 光标等 DOM 用途）：8 位图用 0 号调色板查色，下标 0 透明。
   * 返回 [画布, 锚点偏移 ox, oy]；rawIndex 用于动画帧等原始图像索引，跳过地图图号转换。
   */
  async imageCanvas(mapNumber: number, rawIndex = false): Promise<[HTMLCanvasElement, number, number] | null> {
    const idx = rawIndex || mapNumber >= 1000000 ? mapNumber : this.tile(mapNumber);
    if (idx === undefined) return null;
    let e = this.image(idx);
    for (let i = 0; !e && i < 50; i++) { await new Promise((r) => setTimeout(r, 50)); e = this.image(idx); }
    if (!e || e.page < 0) return null;
    const load = async (url: string) => {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d")!;
      try { g.drawImage(bmp, 0, 0); } finally { bmp.close(); }
      return g.getImageData(0, 0, c.width, c.height);
    };
    const page = await load(this.pageUrl(e.set, e.page));
    const pal = e.set === 0 ? await load(`${this.root}palettes.png`) : null;
    const out = document.createElement("canvas");
    out.width = e.w; out.height = e.h;
    const g = out.getContext("2d")!, img = g.createImageData(e.w, e.h);
    for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) {
      const s = ((e.y + y) * page.width + e.x + x) * 4, d = (y * e.w + x) * 4;
      if (pal) {
        const k = page.data[s];
        if (k === 0) continue;
        img.data.set(pal.data.subarray(k * 4, k * 4 + 3), d);
        img.data[d + 3] = 255;
      } else img.data.set(page.data.subarray(s, s + 4), d);
    }
    g.putImageData(img, 0, 0);
    return [out, e.ox, e.oy];
  }

  anim(id: number): AnimDef | null {
    const a = this.anims.get(id);
    if (a !== undefined) {
      if (a && this.extensionAnims.has(id)) for (const p of a.pages) this.page(this.extensionAnims.get(id)!, Number(p.slice(p.lastIndexOf("/") + 1)));
      return a;
    }
    const fallback = AI_PET_FALLBACK.get(id);
    if (fallback !== undefined && !this.animAt.has(id)) return this.anim(fallback);
    if (this.index) {
      const o = this.animAt.get(id);
      const def = o === undefined ? null : this.decodeAnim(o);
      this.anims.set(id, def);
      if (def) for (const p of def.pages) { const [s, n] = p.split("/"); this.page(SETS.indexOf(s), Number(n)); }
      return def;
    }
    this.anims.set(id, null);
    this.load(fetch(`${this.root}anim/${id}.json`).then((r) => r.json()).then((j: AnimDef) => {
      this.anims.set(id, j);
      for (const p of j.pages) { const [s, n] = p.split("/"); this.page(SETS.indexOf(s), Number(n)); }
    }));
    return null;
  }

  /** 从二进制索引解出一个动画（格式见 server/tools/assetindex） */
  private decodeAnim(o: number): AnimDef {
    const v = this.index!, id = v.getUint32(o, true), np = v.getUint16(o + 4, true), na = v.getUint16(o + 6, true);
    o += 8;
    const pages: string[] = [];
    for (let i = 0; i < np; i++, o += 4) pages.push(`${SETS[v.getUint8(o)]}/${v.getUint16(o + 2, true)}`);
    const actions: AnimAction[] = [];
    for (let k = 0; k < na; k++) {
      const dir = v.getUint8(o), type = v.getUint8(o + 1), ticks = v.getUint16(o + 2, true), freeze = v.getUint8(o + 4), nf = v.getUint16(o + 6, true);
      o += 8;
      const frames: [number, number, number, number][] = [];
      for (let f = 0; f < nf; f++, o += 12) frames.push([v.getInt32(o, true), v.getInt16(o + 4, true), v.getInt16(o + 6, true), v.getUint16(o + 8, true)]);
      actions.push(freeze ? { dir, type, ticks, freeze, frames } : { dir, type, ticks, frames });
    }
    return { id, actions, pages };
  }

  private load(p: Promise<unknown>) {
    this.pending++;
    p.catch((e) => console.warn("资源加载失败", e)).finally(() => { this.pending--; });
  }
}

/** 原客户端的动作条目选择（规格 6.3）：精确匹配 → 同方向站立 → 第 0 条。 */
export function findAction(def: AnimDef, dir: number, type: number): AnimAction | undefined {
  return def.actions.find((a) => a.dir === dir && a.type === type)
    ?? def.actions.find((a) => a.dir === dir && a.type === ANIM.STAND) ?? def.actions[0];
}
