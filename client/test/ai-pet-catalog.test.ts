// node --test client/test/ai-pet-catalog.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { AI_PET_CATALOG, aiPetForSprite } from "../src/ai-pet-catalog.ts";
import { syncAiPetCatalog } from "../../scripts/sync-ai-pet-catalog.mjs";

test("four stable catalogue identities and stories match the server's single source", () => {
  const source = JSON.parse(readFileSync(new URL("../../server/internal/data/ai_pets.json", import.meta.url), "utf8"));
  assert.equal(AI_PET_CATALOG.length, 4);
  assert.deepEqual(AI_PET_CATALOG.map(p => p.sprite), [199100, 199101, 199102, 199103]);
  assert.deepEqual(AI_PET_CATALOG.map(p => p.temp), [29001, 29002, 29003, 29004]);
  assert.deepEqual(AI_PET_CATALOG.map(p => p.name), ["奥普埃", "克劳德", "格鲁克", "吉米奈"]);
  for (const pet of AI_PET_CATALOG) {
    const canonical = source.pets.find((p: any) => p.image === pet.sprite);
    assert.ok(canonical); assert.equal(pet.story, canonical.story); assert.ok(pet.story.length >= 100);
    assert.equal(pet.brief, canonical.story.split("。")[0] + "。");
    assert.equal(pet.name, canonical.name); assert.equal(pet.key, canonical.key); assert.equal(pet.temp, canonical.temp);
    assert.deepEqual(pet.base, canonical.base); assert.equal(pet.base.reduce((a, b) => a + b, 0), 104);
    assert.deepEqual(pet.attrs, canonical.attr); assert.deepEqual(pet.skills, canonical.skills);
    assert.deepEqual([pet.floor, pet.x, pet.y], [canonical.floor, canonical.x, canonical.y]);
    assert.equal(aiPetForSprite(pet.sprite), pet);
  }
  assert.equal(aiPetForSprite(100250), undefined); assert.equal(aiPetForSprite(199104), undefined);
});

test("catalogue regeneration is byte stable and needs no browser server-file fetch", () => {
  const output = new URL("../src/ai-pet-catalog.ts", import.meta.url), before = readFileSync(output, "utf8");
  assert.equal(syncAiPetCatalog(), 4);
  assert.equal(readFileSync(output, "utf8"), before);
  assert.ok(!/\bfetch\(/.test(before));
});
