import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { LILITH_CATALOG } from "../src/lilith-catalog.ts";
import { AI_PET_CATALOG } from "../src/ai-pet-catalog.ts";
import { PET_CATALOG, petForSprite } from "../src/pet-catalog.ts";
import { syncLilithCatalog } from "../../scripts/sync-lilith-catalog.mjs";

test("Lilith's browser biography and habitat match the independent authoritative server definition", () => {
  const p = JSON.parse(readFileSync(new URL("../../server/internal/data/lilith.json", import.meta.url), "utf8"));
  assert.equal(LILITH_CATALOG.name, p.name); assert.equal(LILITH_CATALOG.story, p.story);
  assert.equal(LILITH_CATALOG.brief, p.story.split("。")[0] + "。");
  assert.deepEqual(LILITH_CATALOG.base, p.base); assert.deepEqual(LILITH_CATALOG.attrs, p.attr);
  assert.deepEqual([LILITH_CATALOG.floor, LILITH_CATALOG.x, LILITH_CATALOG.y], [p.floor, p.x, p.y]);
  assert.deepEqual(LILITH_CATALOG.skills, p.skills);
  assert.equal(petForSprite(p.image), LILITH_CATALOG);
  assert.deepEqual(PET_CATALOG.slice(0, 4), AI_PET_CATALOG, "existing saved mechanical-pet identities keep their positions");
  assert.equal(petForSprite(199201), undefined, "the half-field effect is never a pet identity");
});

test("Lilith biography regeneration is byte stable and needs no runtime server-data fetch", () => {
  const path = new URL("../src/lilith-catalog.ts", import.meta.url), before = readFileSync(path, "utf8");
  assert.equal(syncLilithCatalog(), 1); assert.equal(readFileSync(path, "utf8"), before);
  assert.ok(!/\bfetch\(/.test(before));
});
