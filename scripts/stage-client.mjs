// Shared by local builds and CI: stage only the published browser application.
// Run the client builder first. Game assets and local files must never enter embed.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = resolve(root, "server/webclient/static");
const source = join(root, "client/dist");
if (stage !== root + "/server/webclient/static" || lstatSync(stage).isSymbolicLink()) throw Error("unexpected embed staging path");
if (lstatSync(source).isSymbolicLink()) throw Error("symlink at client dist");
// all:static embeds even hidden/unrelated files. Refuse unexpected top-level
// entries instead of silently deleting local data or leaking it in the binary.
for (const entry of readdirSync(stage, { withFileTypes: true })) {
  if (entry.isSymbolicLink()) throw Error("symlink in embed staging: " + entry.name);
  if (!(["dist", "art"].includes(entry.name) && entry.isDirectory())
    && !(["README.txt", "index.html"].includes(entry.name) && entry.isFile())) {
    throw Error("unexpected file in embed staging (not building): " + entry.name);
  }
  if (entry.name === "art") {
    for (const artwork of readdirSync(join(stage, "art"), { withFileTypes: true })) {
      if (artwork.name !== "login.png" || !artwork.isFile() || artwork.isSymbolicLink()) throw Error("unexpected file in embed artwork: " + artwork.name);
    }
  }
}
const files = new Map();
function collect(rel = "") {
  for (const entry of readdirSync(join(source, rel), { withFileTypes: true })) {
    const path = join(rel, entry.name);
    if (entry.isSymbolicLink()) throw Error("symlink in client dist: " + path);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.set(path, readFileSync(join(source, path)));
    else throw Error("unexpected client output: " + path);
  }
}
collect();
if (!files.has("main.js")) throw Error("client build produced no main.js");
const html = readFileSync(join(root, "client/index.html"));
if (!html.includes(Buffer.from("dist/main.js"))) throw Error("missing client entry point");
// Publish one raster file only. Editable SVG and font/license sources stay out
// of the embedded FS, even though the source art directory may contain them.
const artwork = join(root, "client/art/login.png");
if (lstatSync(dirname(artwork)).isSymbolicLink() || lstatSync(artwork).isSymbolicLink() || !lstatSync(artwork).isFile()) throw Error("invalid login artwork path");
const loginPng = readFileSync(artwork);
const dist = join(stage, "dist");
// Only this verified generated child is removed, never the containing tree.
if (dist !== root + "/server/webclient/static/dist") throw Error("unexpected embed dist path");
rmSync(dist, { recursive: true, force: true });
for (const [rel, content] of files) {
  const target = join(dist, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
mkdirSync(join(stage, "art"), { recursive: true });
writeFileSync(join(stage, "art/login.png"), loginPng);
writeFileSync(join(stage, "index.html"), html);
console.log(`Staged index.html, art/login.png and ${files.size} JavaScript files for embedding`);
