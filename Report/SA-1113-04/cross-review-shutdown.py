#!/usr/bin/env python3
"""Reproduce the stopped-World command wait without editing production files.

The old World constructor lacks current test APIs. For a buildable comparison,
restore only its exact Do/Flush function bodies in the current World.go through
a Go overlay. A failed compile or outer timeout never counts as the expected RED.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
REPORT = Path(__file__).resolve().parent
WORLD = ROOT / "server/internal/world/world.go"
TEST = ROOT / "server/internal/world/shutdown_concurrency_test.go"
BASE = "31a8848"
GO = os.environ.get("GO_BIN", "go")


def declaration(source, name):
    anchor = f"func (w *World) {name}("
    if source.count(anchor) != 1:
        raise ValueError(f"ambiguous {name} declaration")
    start = source.index(anchor)
    pos = source.index("{", start)
    depth, state, quote = 0, "code", ""
    while pos < len(source):
        char = source[pos]
        following = source[pos:pos + 2]
        if state == "line":
            if char == "\n":
                state = "code"
        elif state == "block":
            if following == "*/":
                state = "code"
                pos += 1
        elif state == "literal":
            if char == "\\" and quote != "`":
                pos += 1
            elif char == quote:
                state = "code"
        elif following == "//":
            state = "line"
            pos += 1
        elif following == "/*":
            state = "block"
            pos += 1
        elif char in ('"', "'", "`"):
            state, quote = "literal", char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return start, pos + 1
        pos += 1
    raise ValueError(f"unterminated {name} declaration")


def main():
    current = WORLD.read_text()
    original_hash = hashlib.sha256(current.encode()).hexdigest()
    old = subprocess.run(
        ["git", "show", f"{BASE}:server/internal/world/world.go"],
        cwd=ROOT, check=True, text=True, capture_output=True,
    ).stdout
    compatible_baseline = current
    for name in ("Do", "Flush"):
        a, b = declaration(compatible_baseline, name)
        c, d = declaration(old, name)
        compatible_baseline = compatible_baseline[:a] + old[c:d] + compatible_baseline[b:]
    scratch = Path(tempfile.mkdtemp(prefix="sa111304-shutdown-cross-"))
    replacement = scratch / "world-baseline.go"
    replacement.write_text(compatible_baseline)
    overlay = scratch / "overlay.json"
    overlay.write_text(json.dumps({"Replace": {str(WORLD): str(replacement)}}))
    env = dict(os.environ)
    env.setdefault("GOMAXPROCS", "2")
    env.setdefault("GOMEMLIMIT", "400MiB")
    common = ["./internal/world", "-run", "^TestWorldShutdownConcurrentFlushAndDo$", "-count=1", "-v", "-timeout", "20s"]
    runs = {}
    for mode, arguments in (
        ("red", ["test", "-race", "-overlay", str(overlay), *common]),
        ("green", ["test", "-race", *common]),
    ):
        if hashlib.sha256(WORLD.read_bytes()).hexdigest() != original_hash:
            raise RuntimeError("World.go changed during the comparison; rerun against stable inputs")
        start = time.monotonic()
        result = subprocess.run(
            [GO, *arguments], cwd=ROOT / "server", env=env,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            timeout=180,
        )
        (REPORT / f"cross-review-shutdown-{mode}.txt").write_text(result.stdout)
        reached = "SHUTDOWN_CONCURRENCY_REACHED:" in result.stdout
        product_timeout = (
            "Do/Flush remained blocked after the world stopped" in result.stdout
            or "late Do remained blocked on a world that had already stopped" in result.stdout
        )
        valid = reached and (result.returncode != 0 and product_timeout if mode == "red" else result.returncode == 0)
        runs[mode] = {"exit_code": result.returncode, "reached": reached,
                      "product_timeout": product_timeout, "expected_result": valid,
                      "wall_seconds_including_compile": round(time.monotonic() - start, 3)}
        print(f"{mode}: {json.dumps(runs[mode])}", flush=True)
        print(result.stdout, flush=True)
        if not valid:
            raise RuntimeError(f"{mode} did not establish its expected product behavior")
    summary = {"baseline_commit": BASE, "baseline_scope": "exact Do/Flush declarations in compatible current World.go",
               "world_sha256": original_hash, "test_sha256": hashlib.sha256(TEST.read_bytes()).hexdigest(),
               "overlay": str(overlay), "runs": runs}
    (REPORT / "cross-review-shutdown.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
