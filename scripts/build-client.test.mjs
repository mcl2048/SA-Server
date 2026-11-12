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
  for (const dir of ["client/src", "scripts", "server/webclient/static"]) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ["client/build.mjs", "scripts/stage-client.mjs"]) cpSync(join(sourceRoot, file), join(root, file));
  writeFileSync(join(root, "client/src/main.ts"), 'import { value } from "./dep.ts";\nconsole.log(value);\n');
  writeFileSync(join(root, "client/src/dep.ts"), "export const value: number = 42;\n");
  writeFileSync(join(root, "client/index.html"), '<script type="module" src="dist/main.js?v=old"></script>\n');
  writeFileSync(join(root, "server/webclient/static/README.txt"), "tracked build marker\n");
  return root;
}
function run(root, file) { return spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8" }); }
function succeeds(root, file) { const result = run(root, file); assert.equal(result.status, 0, result.stderr); }
function output(root) {
  return Object.fromEntries(["index.html", ...readdirSync(join(root, "client/dist")).map(name => "dist/" + name)].map(file => [file, readFileSync(join(root, "client", file), "utf8")]));
}

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
