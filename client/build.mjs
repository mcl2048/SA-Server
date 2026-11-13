// 把 src/ 下的 TypeScript 去掉类型输出为浏览器可用的 JS（Node 自带 stripTypeScriptTypes，无需安装依赖）。
// 只支持可擦除的 TS 语法：不能用 enum、namespace、参数属性。
// 运行：node client/build.mjs   输出到 client/dist/
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, lstatSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { syncAiPetCatalog } from "../scripts/sync-ai-pet-catalog.mjs";

syncAiPetCatalog();

const root = join(dirname(fileURLToPath(import.meta.url)), "src");
const out = join(dirname(fileURLToPath(import.meta.url)), "dist");
const seen = new Set();
const sources = new Map();
const output = new Map();
const imports = /(from\s+["'])(\.{1,2}\/[^"']+)\.ts(["'])/g;
const resolveImport = (rel, path) => relative(root, join(dirname(join(root, rel)), path + ".ts")).replaceAll("\\", "/");
function collect(rel) {
  if (sources.has(rel)) return;
  const src = readFileSync(join(root, rel), "utf8");
  sources.set(rel, src);
  for (const match of src.matchAll(imports)) collect(resolveImport(rel, match[2]));
}
collect("main.ts");
const htmlPath = join(dirname(fileURLToPath(import.meta.url)), "index.html");
const template = readFileSync(htmlPath, "utf8").replace(/src="dist\/main\.js[^"]*"/, 'src="dist/main.js"');
const hash = createHash("sha256").update(template).update(readFileSync(fileURLToPath(import.meta.url)));
for (const [rel, src] of [...sources].sort(([a], [b]) => a.localeCompare(b, "en"))) hash.update(rel).update("\0").update(src).update("\0");
const artwork = join(dirname(htmlPath), "art", "login.png");
if (lstatSync(dirname(artwork)).isSymbolicLink() || lstatSync(artwork).isSymbolicLink() || !lstatSync(artwork).isFile()) throw Error("invalid login artwork path");
hash.update("art/login.png\0").update(readFileSync(artwork)).update("\0");
const version = hash.digest("hex").slice(0, 16); // 相同源码产生相同缓存版本，代码或样式变化自动失效

function build(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = sources.get(rel);
  const js = stripTypeScriptTypes(src).replace(imports, (_, a, path, b) => {
    build(resolveImport(rel, path));
    return `${a}${path}.js?v=${version}${b}`;
  }).replace(/[\t ]+$/gm, "");
  output.set(rel.replace(/\.ts$/, ".js"), js);
}

build("main.ts");
// dist is exclusively generated. Finish parsing all sources before replacing it,
// so a failed source conversion cannot partially overwrite the previous build.
if (out !== join(dirname(htmlPath), "dist")) throw Error("unexpected client output path");
try { if (lstatSync(out).isSymbolicLink()) throw Error("symlink at client dist"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
rmSync(out, { recursive: true, force: true });
for (const [rel, js] of output) {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, js);
}
writeFileSync(htmlPath, template.replace(/src="dist\/main\.js"/, `src="dist/main.js?v=${version}"`));
console.log(`已构建 ${seen.size} 个文件 → client/dist/：${[...seen].join(", ")}`);
