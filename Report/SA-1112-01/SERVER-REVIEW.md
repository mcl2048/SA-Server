# Server embedding and release review

Review date: 2026-11-12 UTC. Scope: read-only review of current server HTTP/client selection, release script, dependency manifests and mobile integration in `client/src/main.ts`. No production source was changed during this review. The reviewer previously implemented the server embedding; this is a second pass, not an independent-author server audit. Browser gameplay evidence is owned by the main agent and is not claimed here.

## Findings

1. **Build determinism finding, resolved after this review.** The reviewed `client/build.mjs` used `Date.now()` for module query versions. The parent subsequently replaced this with a source/page/builder SHA256 token and removed type-erasure trailing whitespace. `client-build-repeatability.json` verifies two consecutive client builds produced identical HTML and all 35 modules. This proves client output repeatability with the tested toolchain; it is not a claim that binary rebuilds across different Git build metadata/toolchains are identical.
2. **Existing battle presentation protocol omission.** Internal battle events calculate `Stat`, `StatVal` and `Icon`, but the upstream JSON schema and `world/fight.go` conversion omit them. The reader's optional local type extension preserves runtime behavior. Some stat hints can remain undefined/NaN and skill icons absent. This predates the mobile work; no protocol/gameplay change was made to hide it.
3. **Build provenance requires both records.** Current Go build-info contains the delivery repository's precommit revision and `vcs.modified=true`, not the imported upstream commit. `SOURCE-BASELINE.json` separately records upstream `b28455eb9e25033ded04bd5ac43f6f143b26e6be`. Do not present the delivery build's VCS revision as that upstream baseline.

No new blocking security or correctness defect was found in the reviewed serving changes.

## Serving and compatibility checks

- Client route boundary is exactly `/`, `/index.html`, and non-hidden `dist/**/*.js`. Decoded dot segments, backslashes, empty components, source TypeScript, source maps, config files and directory listing requests are rejected. Query versions do not affect this check. The enclosing Go mux can redirect canonical paths; this does not widen the allowed file set.
- Both embedded and explicit external clients use the same route boundary. External directories are operator-controlled trusted content; `os.DirFS` is not a symlink sandbox against a malicious local operator.
- Literal `client`, literal `embedded` and an empty configured client select embedded files. `./client`, custom relative paths and absolute paths remain explicit external choices; normalization happens after this choice, and config.local.yaml overrides are covered by tests.
- HTML uses `no-store`; JavaScript uses `no-cache`, explicit JavaScript MIME and `nosniff`. Only GET/HEAD are supported. HEAD bypasses the shared gzip writer so no gzip trailer is emitted as a body.
- Existing `/ws` and `/assets/` routes remain separate. Game data and graphical/audio assets remain external runtime dependencies; embedding the UI does not supply game assets.
- The tracked static README marker permits source-only Go compilation. Without generated HTML the client returns HTTP503 with a build instruction. The marker is not an allowed HTTP route and cannot masquerade as a working game.

## Release checks

- `scripts/build-linux.sh` resolves paths from its own location; builds the actual client; copies only HTML and JavaScript into the generated embed tree; rejects encountered JS source symlinks; clears generated dist; builds CGO-disabled Linux AMD64 with `-trimpath`, low parallelism and a version stamp; atomically replaces the binary; writes a SHA256 receipt.
- Final release verification must run the built binary with its external client directory unavailable, compare served HTML and every referenced module against matching published output, and assert real login/gameplay. A successful ordinary `go build` alone is insufficient because the tracked marker intentionally permits an unbuilt client.
- Snapshot during review: staged `index.html` plus 35 JavaScript files matched their `client/` counterparts byte-for-byte (36 files). This confirms staging consistency, not by itself bytes served by a running ELF.
- Snapshot binary: mode `0755`, SHA256 `9745423bf1b6c94dc12c6b4bae76f3ec8a4353ee920ac06ef3a6e68b0949b898`; Go build-info: Go1.27.3, Linux AMD64, CGO_ENABLED=0, trimpath=true. The parent may rebuild afterward; this snapshot is not a declaration of final delivery identity.
- `server/go.mod` and `server/go.sum` hashes match the exact upstream baseline. Minimum declared Go is 1.27.1; the installed validation/build toolchain is 1.27.3. No dependency upgrade is introduced by embedding.

## Mobile main integration review

Mobile commands are gated by `isMobile()`, invoke the existing menus and network protocol, and do not introduce privileged game commands. The mobile action queue validates screen and modal identity before forwarding the previous-frame hit target. D-pad motion is gated by field/battle/input/modal state; mode changes, blur and visibility loss release held mobile input. Desktop follow-mode and keyboard/menu paths remain separate at the relevant branches. GPU cache budget changes are also mode-gated. These source observations do not substitute for browser, touch-device or business-flow tests.

## Validation and limits

The main agent reports the complete non-race Go suite (238 tests) and full vet pass; this review does not relabel those as race results. Earlier focused HTTP/config tests, route tests and TypeScript checks passed. A focused race run covers only `./cmd/saserver` and `./webclient` with Go1.27.3, CGO_ENABLED=1, GOMAXPROCS=2 and GOMEMLIMIT=400MiB; its command, UTC timing, toolchain and exit receipt are in `server-race.log`. Focused race result: **PASS**, exit code 0, completed at 2026-11-12T14:23:47Z; both packages passed without a reported race. No full Go race suite was run or claimed by this reviewer.
