import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sa-client-build-test-"));
  t.after(() => {
    assert.equal(dirname(root), tmpdir());
    assert.ok(root.startsWith(join(tmpdir(), "sa-client-build-test-")));
    rmSync(root, { recursive: true, force: true });
  });
  for (const dir of ["client/src", "client/art", "scripts", "server/webclient/static", "server/internal/data"]) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ["client/build.mjs", "scripts/stage-client.mjs", "scripts/sync-ai-pet-catalog.mjs", "scripts/sync-lilith-catalog.mjs", "scripts/sync-lisarido-catalog.mjs", "scripts/sync-primal-claws-catalog.mjs", "server/internal/data/ai_pets.json", "server/internal/data/lilith.json", "server/internal/data/lisarido.json", "server/internal/data/primal_claws.json", "client/src/lisarido-catalog.ts", "client/src/ai-pet-catalog.ts"]) cpSync(join(sourceRoot, file), join(root, file));
  writeFileSync(join(root, "client/src/main.ts"), 'import { value } from "./dep.ts";\nconsole.log(value);\n');
  writeFileSync(join(root, "client/src/dep.ts"), "export const value: number = 42;\n");
  writeFileSync(join(root, "client/index.html"), '<script type="module" src="dist/main.js?v=old"></script>\n');
  writeFileSync(join(root, "server/webclient/static/README.txt"), "tracked build marker\n");
  writeFileSync(join(root, "client/art/login.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
  writeFileSync(join(root, "client/art/login.svg"), "PRIVATE EDITABLE ARTWORK");
  return root;
}
function run(root, file) { return spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8" }); }
function succeeds(root, file) { const result = run(root, file); assert.equal(result.status, 0, result.stderr); }
function output(root) {
  return Object.fromEntries(["index.html", ...readdirSync(join(root, "client/dist")).map(name => "dist/" + name)].map(file => [file, readFileSync(join(root, "client", file), "utf8")]));
}

test("Lisarido biography changes regenerate its independent catalogue and invalidate the release",t=>{
 const root=fixture(t);
 writeFileSync(join(root,"client/src/main.ts"),'import { LISARIDO_CATALOG } from "./lisarido-catalog.ts";\nconsole.log(LISARIDO_CATALOG);\n');
 succeeds(root,"client/build.mjs");const first=output(root),path=join(root,"server/internal/data/lisarido.json");
 const p=JSON.parse(readFileSync(path,"utf8"));p.story+="远方的矿工循着炮火找回归路。";writeFileSync(path,JSON.stringify(p));
 succeeds(root,"client/build.mjs");const second=output(root);
 assert.notEqual(second["index.html"],first["index.html"]);assert.match(second["dist/lisarido-catalog.js"],/远方的矿工循着炮火找回归路/);
 p.image=199200;writeFileSync(path,JSON.stringify(p));const rejected=run(root,"client/build.mjs");
 assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Invalid Lisarido catalogue identity/);assert.deepEqual(output(root),second);
});

test("shared pet stories regenerate the catalogue and invalidate the client version", t => {
  const root = fixture(t);
  writeFileSync(join(root, "client/src/main.ts"), 'import { AI_PET_CATALOG } from "./ai-pet-catalog.ts";\nconsole.log(AI_PET_CATALOG);\n');
  succeeds(root, "client/build.mjs"); const first = output(root);
  const catalogPath = join(root, "server/internal/data/ai_pets.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  catalog.pets[0].story += "同行者带来了新的星图。";
  writeFileSync(catalogPath, JSON.stringify(catalog));
  succeeds(root, "client/build.mjs"); const second = output(root);
  assert.notEqual(first["index.html"], second["index.html"]);
  assert.match(second["dist/ai-pet-catalog.js"], /同行者带来了新的星图/);
  catalog.pets[0].image = catalog.pets[1].image;
  writeFileSync(catalogPath, JSON.stringify(catalog));
  const rejected = run(root, "client/build.mjs"); assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Invalid AI pet catalogue identities/);
  assert.deepEqual(output(root), second);
});

test("artwork changes invalidate build versions and only the login PNG is staged", t => {
  const root = fixture(t);
  succeeds(root, "client/build.mjs"); const first = output(root);
  succeeds(root, "scripts/stage-client.mjs");
  const stageArt = join(root, "server/webclient/static/art");
  assert.deepEqual(readdirSync(stageArt), ["login.png"]);
  assert.deepEqual(readFileSync(join(stageArt, "login.png")), readFileSync(join(root, "client/art/login.png")));
  writeFileSync(join(root, "client/art/login.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2]));
  succeeds(root, "client/build.mjs"); assert.notEqual(output(root)["index.html"], first["index.html"]);
  succeeds(root, "scripts/stage-client.mjs");
  assert.deepEqual(readFileSync(join(stageArt, "login.png")), readFileSync(join(root, "client/art/login.png")));
  assert.ok(!existsSync(join(stageArt, "login.svg")));
  const previous = readFileSync(join(root, "server/webclient/static/index.html"));
  writeFileSync(join(stageArt, "login.svg"), "DO NOT EMBED");
  const rejected = run(root, "scripts/stage-client.mjs");
  assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /unexpected file in embed artwork/);
  assert.deepEqual(readFileSync(join(root, "server/webclient/static/index.html")), previous);
});

test("builder and stager reject source artwork symlinks before replacing releases", t => {
  const root = fixture(t); succeeds(root, "client/build.mjs"); succeeds(root, "scripts/stage-client.mjs");
  const previous = output(root);
  const image = join(root, "client/art/login.png"); assert.equal(image, root + "/client/art/login.png"); rmSync(image);
  symlinkSync(join(root, "client/art/login.svg"), image);
  for (const command of ["client/build.mjs", "scripts/stage-client.mjs"]) {
    const result = run(root, command); assert.notEqual(result.status, 0); assert.match(result.stderr, /invalid login artwork path/);
  }
  assert.deepEqual(output(root), previous);
});

test("stager rejects symlinks inside its exact artwork allowlist", t => {
  const root = fixture(t); succeeds(root, "client/build.mjs"); succeeds(root, "scripts/stage-client.mjs");
  const image = join(root, "server/webclient/static/art/login.png"); assert.equal(image, root + "/server/webclient/static/art/login.png"); rmSync(image);
  symlinkSync(join(root, "client/art/login.png"), image);
  const result = run(root, "scripts/stage-client.mjs"); assert.notEqual(result.status, 0); assert.match(result.stderr, /unexpected file in embed artwork/);
});

test("repeated builds match, removed imports and retired JS cannot enter the release", t => {
  const root = fixture(t);
  succeeds(root, "client/build.mjs"); const first = output(root);
  succeeds(root, "client/build.mjs"); assert.deepEqual(output(root), first);
  writeFileSync(join(root, "client/dist/retired.js"), "PRIVATE OLD BUILD\n");
  writeFileSync(join(root, "client/src/main.ts"), "console.log('new release');\n");
  succeeds(root, "client/build.mjs");
  assert.deepEqual(readdirSync(join(root, "client/dist")), ["main.js"]);
  assert.notEqual(output(root)["index.html"], first["index.html"]);
  succeeds(root, "scripts/stage-client.mjs");
  assert.deepEqual(readdirSync(join(root, "server/webclient/static/dist")), ["main.js"]);
  assert.equal(readFileSync(join(root, "server/webclient/static/dist/main.js"), "utf8"), output(root)["dist/main.js"]);
});

test("staging refuses unrelated embedded data before changing the previous client", t => {
  const root = fixture(t); succeeds(root, "client/build.mjs"); succeeds(root, "scripts/stage-client.mjs");
  const stage = join(root, "server/webclient/static"); const previous = readFileSync(join(stage, "index.html"), "utf8");
  writeFileSync(join(stage, ".local-secret"), "MUST NOT ENTER BINARY");
  const result = run(root, "scripts/stage-client.mjs");
  assert.notEqual(result.status, 0); assert.match(result.stderr, /unexpected file in embed staging/);
  assert.equal(readFileSync(join(stage, "index.html"), "utf8"), previous);
  assert.ok(existsSync(join(stage, ".local-secret")), "do not silently delete operator data");
});

test("failed TypeScript parsing preserves prior output and entry version", t => {
  const root = fixture(t); succeeds(root, "client/build.mjs"); const previous = output(root);
  writeFileSync(join(root, "client/src/dep.ts"), "export const value: = ;\n");
  assert.notEqual(run(root, "client/build.mjs").status, 0);
  assert.deepEqual(output(root), previous);
});

test("builder and stager reject output symlinks without modifying the target", t => {
  const root = fixture(t); const outside = join(root, "operator-data"); mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "KEEP"); symlinkSync(outside, join(root, "client/dist"), "dir");
  let result = run(root, "client/build.mjs"); assert.notEqual(result.status, 0); assert.match(result.stderr, /symlink at client dist/);
  result = run(root, "scripts/stage-client.mjs"); assert.notEqual(result.status, 0); assert.match(result.stderr, /symlink at client dist/);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "KEEP");
});

test("primal biographies regenerate together and invalidate cache without allowing identity collisions",t=>{
 const root=fixture(t);
 writeFileSync(join(root,"client/src/main.ts"),'import { PRIMAL_CLAWS_CATALOG } from "./primal-claws-catalog.ts";\nconsole.log(PRIMAL_CLAWS_CATALOG);\n');
 succeeds(root,"client/build.mjs");const first=output(root),path=join(root,"server/internal/data/primal_claws.json");
 const data=JSON.parse(readFileSync(path,"utf8"));data.pets[1].story+="红瞳照亮回家的石廊。";writeFileSync(path,JSON.stringify(data));
 succeeds(root,"client/build.mjs");const second=output(root);
 assert.notEqual(first["index.html"],second["index.html"]);assert.match(second["dist/primal-claws-catalog.js"],/红瞳照亮回家的石廊/);
 data.pets[1].image=199400;writeFileSync(path,JSON.stringify(data));const result=run(root,"client/build.mjs");
 assert.notEqual(result.status,0);assert.match(result.stderr,/Invalid primal claw catalogue identity/);assert.deepEqual(output(root),second);
});
