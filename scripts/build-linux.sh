#!/usr/bin/env bash
# Build a matching web client and static Linux AMD64 server from any directory.
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
version="${VERSION:-v0.2.16-LYNX}"
go_bin="${GO_BIN:-go}"
if [[ ! "$version" =~ ^[A-Za-z0-9._+-]+$ ]]; then
  echo 'VERSION must contain only letters, digits, dot, underscore, plus or hyphen' >&2
  exit 1
fi
export GOMAXPROCS="${GOMAXPROCS:-2}"
export GOMEMLIMIT="${GOMEMLIMIT:-400MiB}"
node "$root/client/build.mjs"
# Shared with CI; rejects unrelated local files before go:embed can include them.
node "$root/scripts/stage-client.mjs"
mkdir -p "$root/bin"
# Build to a sibling first: failed compilation leaves the existing release intact.
output="$root/bin/.saserver.build.$$"
# The explicit version and recorded inputs identify the release. Excluding the
# transient dirty/commit stamp keeps identical source/client inputs reproducible.
(cd "$root/server" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 "$go_bin" build -p 1 -trimpath -buildvcs=false -ldflags "-s -w -X main.version=$version" -o "$output" ./cmd/saserver)
chmod 0755 "$output"
# Both paths are fixed children of the resolved repository root.
[[ "$output" == "$root/bin/.saserver.build."* && -f "$output" ]]
mv -f -- "$output" "$root/bin/saserver"
(cd "$root" && sha256sum bin/saserver > bin/saserver.sha256)
"$root/bin/saserver" --version
cat "$root/bin/saserver.sha256"
