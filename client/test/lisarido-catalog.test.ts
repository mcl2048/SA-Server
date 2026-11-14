import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PET_CATALOG, petForSprite } from "../src/pet-catalog.ts";
import { syncLisaridoCatalog } from "../../scripts/sync-lisarido-catalog.mjs";

test("Lisarido appends an independent biography matching the authoritative cave registry",()=>{
 const p=JSON.parse(readFileSync(new URL("../../server/internal/data/lisarido.json",import.meta.url),"utf8"));
 const entry=petForSprite(199300);
 assert.ok(entry,"new pet must participate in the original details and album path");
 assert.deepEqual(PET_CATALOG.slice(0,5).map(p=>p.sprite),[199100,199101,199102,199103,199200]);
 assert.equal(PET_CATALOG[5],entry);assert.equal(entry.name,p.name);assert.equal(entry.story,p.story);
 assert.deepEqual(entry.base,[26,60,16,47]);assert.deepEqual(entry.attrs,[0,0,70,30]);
 assert.deepEqual([entry.floor,entry.x,entry.y],[11202,40,40]);assert.deepEqual(entry.skills,[1,2,29050]);
 assert.equal(petForSprite(199301),undefined,"electromagnetic explosions are not pets");
});

test("Lisarido catalogue regeneration is byte stable",()=>{
 const path=new URL("../src/lisarido-catalog.ts",import.meta.url),before=readFileSync(path,"utf8");
 assert.equal(syncLisaridoCatalog(),1);assert.equal(readFileSync(path,"utf8"),before);
});
