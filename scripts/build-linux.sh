#!/usr/bin/env bash
# Build a matching web client and static Linux AMD64 server from any directory.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
version="${VERSION:-v0.2.4-LYNX}"
go_bin="${GO_BIN:-go}"
if [[ ! "$version" =~ ^[A-Za-z0-9._+-]+$ ]]; then
  echo 'VERSION must contain only letters, digits, dot, underscore, plus or hyphen' >&2
  exit 1
fi
export GOMAXPROCS="${GOMAXPROCS:-2}"
export GOMEMLIMIT="${GOMEMLIMIT:-400MiB}"
node "$root/client/build.mjs"
# Stage only published files. Never embed src, maps, local configuration or assets.
node --input-type=module - "$root" <<'NODE'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = process.argv[2];
const stage = resolve(root, 'server/webclient/static');
if (stage !== root + '/server/webclient/static' || lstatSync(stage).isSymbolicLink()) throw Error('unexpected embed staging path');
const dist = join(stage, 'dist');
// dist is exclusively generated here. Do not follow an unexpected symlink.
try { if (lstatSync(dist).isSymbolicLink()) throw Error('symlink at embed dist'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
rmSync(dist, { recursive: true, force: true });
let count = 0;
function copy(rel = '') {
  for (const entry of readdirSync(join(root, 'client/dist', rel), { withFileTypes: true })) {
    const path = join(rel, entry.name);
    if (entry.isSymbolicLink()) throw Error('symlink in client dist: ' + path);
    if (entry.isDirectory()) copy(path);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const target = join(dist, path);
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, readFileSync(join(root, 'client/dist', path)));
      count++;
    }
  }
}
copy();
if (!count) throw Error('client build produced no JavaScript');
const html = readFileSync(join(root, 'client/index.html'));
if (!html.includes(Buffer.from('dist/main.js'))) throw Error('missing client entry point');
writeFileSync(join(stage, 'index.html'), html);
console.log(`Staged index.html and ${count} JavaScript files for embedding`);
NODE
mkdir -p "$root/bin"
# Build to a sibling first: failed compilation leaves the existing release intact.
output="$root/bin/.saserver.build.$$"
(cd "$root/server" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 "$go_bin" build -p 1 -trimpath -ldflags "-s -w -X main.version=$version" -o "$output" ./cmd/saserver)
chmod 0755 "$output"
# Both paths are fixed children of the resolved repository root.
[[ "$output" == "$root/bin/.saserver.build."* && -f "$output" ]]
mv -f -- "$output" "$root/bin/saserver"
(cd "$root" && sha256sum bin/saserver > bin/saserver.sha256)
"$root/bin/saserver" --version
cat "$root/bin/saserver.sha256"
