// node --test client/test/album.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { Album } from "../src/album.ts";
import { AI_PET_CATALOG } from "../src/ai-pet-catalog.ts";
import { ANIM } from "../src/assets.ts";
import { PetWindow, type PetHost } from "../src/pets.ts";
import type { PetInfo } from "../src/proto.gen.ts";

Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ font: "", measureText: (s: string) => ({ width: s.length * 14 }), drawImage() {} }) }) } });
function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  return values;
}
const pet = (sprite: number, freeName = "") => ({ sprite, freeName, level: 18, maxHp: 321, atk: 45, agi: 67, def: 89, attrs: [10, 20, 30, 40] } as PetInfo);
function ui() {
  const text: { x: number; y: number; text: string }[] = [], images: any[][] = [], decoded: any[][] = [], portraits: any[][] = [];
  let click = "";
  const mock: any = {
    assets: {
      anim: (id: number) => ({ id, pages: [], actions: [{ dir: 1, type: ANIM.STAND, ticks: 5, frames: [[9000000 + id - 199100, 3, -4, 0]] }] }),
      imageCanvas: (...args: any[]) => { decoded.push(args); return Promise.resolve([{ width: 160, height: 160 }, -80, -140]); },
    },
    pic: (...args: any[]) => portraits.push(args),
    hitBox() { return false; }, box() {}, window() {},
    image: (...args: any[]) => { images.push(args); return false; },
    button: (_image: number, _x: number, _y: number, id: string) => id === click,
    clicked: (id: string) => id === click,
    text: (x: number, y: number, value: string, _color: string, id?: string) => { text.push({ x, y, text: value }); return id === click; },
  };
  return { mock, text, images, decoded, portraits, click: (id: string) => { click = id; } };
}

test("old 570-slot save survives four appended seen/snap entries and account reload", () => {
  const values = storage(), key = "sa.album.account";
  const legacy = { 0: { flag: 3, name: "乌力", freeName: "原昵称", face: 28001, level: 7, maxHp: 50 }, 569: { flag: 1, name: "旧末格" } };
  values.set(key, JSON.stringify(legacy));
  const album = new Album(); album.load("account");
  for (const [i, definition] of AI_PET_CATALOG.entries()) {
    album.seen(definition.sprite);
    const seen = JSON.parse(values.get(key)!); assert.deepEqual(seen[570 + i], { flag: 1, name: definition.name, sprite: definition.sprite });
    assert.equal(album.snap(pet(definition.sprite, `伙伴${i}`)), `伙伴${i} 照相完成！`);
    const saved = JSON.parse(values.get(key)!); assert.deepEqual(saved[0], legacy[0]); assert.deepEqual(saved[569], legacy[569]);
    assert.deepEqual(saved[570 + i], { flag: 2, name: definition.name, freeName: `伙伴${i}`, sprite: definition.sprite, level: 18, maxHp: 321, str: 45, quick: 67, def: 89, attr: [10, 20, 30, 40] });
  }
  const restored: any = new Album(); restored.load("account"); assert.equal(restored.list.length, 574);
  for (let i = 0; i < 4; i++) assert.equal(restored.list[570 + i].freeName, `伙伴${i}`);
  assert.deepEqual(restored.list[0], legacy[0]); assert.deepEqual(restored.list[569], legacy[569]);
  restored.load("another"); assert.equal(restored.list[570].flag, 0);
});

test("legacy seen and snapshot IDs and portraits retain their original mapping", () => {
  const values = storage(), album = new Album(); album.load("old");
  album.seen(100250); assert.deepEqual(JSON.parse(values.get("sa.album.old")!)[0], { flag: 1, name: "乌力" });
  assert.equal(album.snap(pet(100250)), "乌力 照相完成！");
  const saved = JSON.parse(values.get("sa.album.old")!); assert.equal(saved[0].face, 28001); assert.equal(saved[0].sprite, undefined);
  assert.equal(album.snap(pet(100451)), null); assert.equal(album.snap(pet(199104)), null);
});

test("all appended slots fit the existing last page and render raw animation portraits plus canonical stories", async () => {
  const values = storage(), album: any = new Album(); album.load("faces"); album.open = true;
  for (const petData of AI_PET_CATALOG) album.snap(pet(petData.sprite));
  const h = ui(); h.click("album-prev"); album.frame(h.mock, []); h.click("");
  assert.equal(album.page, 71);
  album.frame(h.mock, []);
  for (const petData of AI_PET_CATALOG) assert.ok(h.text.some(line => line.text === petData.name));
  for (const [i, petData] of AI_PET_CATALOG.entries()) {
    h.click(`album-${570 + i}`); album.frame(h.mock, []); h.click(""); h.text.length = 0; h.images.length = 0;
    const rects: number[][] = []; album.frame(h.mock, rects); await Promise.resolve(); album.frame(h.mock, []);
    assert.ok(h.decoded.some(args => args[0] === 9000000 + i && args[1] === true));
    const portrait = h.portraits.at(-1); assert.ok(portrait);
    assert.deepEqual([portrait[0].width, portrait[0].height, ...portrait.slice(1)], [108, 108, 149, 67]);
    const decodes = h.decoded.length; h.text.length = 0; album.frame(h.mock, []); assert.equal(h.decoded.length, decodes);
    assert.ok(!h.images.some(args => args[0] === petData.sprite));
    assert.equal(h.text.filter(line => line.x === 298 && line.y >= 46).map(line => line.text).join(""), petData.story);
    assert.ok(rects.some(rect => rect[0] === 280 && rect[2] === 536 && rect[3] <= 600));
    assert.equal(JSON.parse(values.get("sa.album.faces")!)[570 + i].flag, 3);
  }
  const restored: any = new Album(); restored.load("faces"); assert.equal(restored.list[573].flag, 3);
});

test("missing portrait decoding retries later, uses raw fallback frames, and caches success", async t => {
  const album: any = new Album(), h = ui(); let now = 100, calls = 0;
  t.mock.method(performance, "now", () => now);
  h.mock.assets.imageCanvas = (image: number, raw: boolean) => {
    assert.equal(image, 12345); assert.equal(raw, true); calls++;
    return calls === 1 ? Promise.reject(Error("page not ready")) : Promise.resolve([{ width: 64, height: 96 }, -32, -80]);
  };
  album.spritePortrait(h.mock, 12345, 203, 121); album.spritePortrait(h.mock, 12345, 203, 121);
  assert.equal(calls, 1); await new Promise(resolve => setImmediate(resolve));
  album.spritePortrait(h.mock, 12345, 203, 121); assert.equal(calls, 1);
  now += 1001; album.spritePortrait(h.mock, 12345, 203, 121); assert.equal(calls, 2);
  await new Promise(resolve => setImmediate(resolve)); album.spritePortrait(h.mock, 12345, 203, 121);
  assert.deepEqual([h.portraits[0][0].width, h.portraits[0][0].height, ...h.portraits[0].slice(1)], [64, 96, 171, 73]);
  album.spritePortrait(h.mock, 12345, 203, 121); assert.equal(calls, 2);
});

test("new-pet brief descriptions fit the existing stat extension panel without changing old pets", () => {
  const h = ui(), window: any = new PetWindow({ ui: h.mock } as PetHost);
  const extension = { rank: 104, getLevel: 20, enemyId: 29001, alloc: [28, 22, 30, 24], std: [28, 22, 30, 24], grow: [1, 2, 3, 4], real: [1, 2, 3, 4], init: [1, 2, 3, 4], resist: [0, 0, 0, 0, 0, 0], critical: 0, counter: 0, rare: 0, vai: 0, magic: [0, 0, 0, 0, 0, 0, 0, 0] };
  for (const definition of AI_PET_CATALOG) {
    h.text.length = 0; const rects: number[][] = [];
    window.extPanel({ ...pet(definition.sprite), name: definition.name, rideInfo: "ok", ext: extension }, rects);
    assert.ok(h.text.some(line => line.text === "简介（完整故事见图鉴）"));
    const descriptionAt = h.text.findIndex(line => line.text === "简介（完整故事见图鉴）");
    assert.equal(h.text.slice(descriptionAt + 1).map(line => line.text).join(""), definition.brief);
    assert.ok(rects[0][3] <= 600);
  }
  h.text.length = 0; window.extPanel({ ...pet(100250), name: "乌力", ext: extension }, []);
  assert.ok(!h.text.some(line => line.text.includes("简介")));
});

test("retaking a renamed pet updates its snapshot without overwriting adjacent original slots", () => {
  const values = storage(), album = new Album(); album.load("rename");
  album.snap(pet(100250, "旧宠")); album.snap(pet(199100, "新昵称")); album.snap(pet(199100));
  const saved = JSON.parse(values.get("sa.album.rename")!);
  assert.equal(saved[0].freeName, "旧宠"); assert.equal(saved[570].name, "奥普埃"); assert.equal(saved[570].freeName, "奥普埃");
});

test("pet details and album retain a stable native model for the fullscreen game window", () => {
  const p=pet(199100),h=ui(),models:any[]=[];
  h.mock.mobilePortrait=(...args:any[])=>models.push(args);
  const wnd:any=new PetWindow({ui:h.mock,pets:()=>({pets:[p]}),mailPet:()=>-1} as any);
  wnd.drawPet(p);wnd.drawPet(p);
  assert.deepEqual(models,[[9000000,true],[9000000,true]],"animation ticks cannot create a different decoded page every frame");
  storage();const album:any=new Album();album.load("native-model");album.open=true;
  album.snap(p);album.page=71;album.sel=570;album.frame(h.mock,[]);
  assert.deepEqual(models.at(-1),[9000000,true]);
});
