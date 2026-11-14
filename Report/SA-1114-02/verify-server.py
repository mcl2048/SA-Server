#!/usr/bin/env python3
"""Reproduce the native-action audit without editing production package files."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
with tempfile.TemporaryDirectory(prefix="sa111402-overlay-") as directory:
    overlay = Path(directory) / "overlay.json"
    overlay.write_text(json.dumps({"Replace": {
        str(ROOT / "server/internal/world/sa111402_review_test.go"):
        str(HERE / "server-review_test.go")
    }}))
    command = ["go", "test", "-race", "-p", "1", "-count=1", "-v",
               "-overlay=" + str(overlay), "./internal/world",
               "-run", "^TestSA111402"]
    environment = dict(os.environ, GOMAXPROCS="2", GOMEMLIMIT="400MiB")
    result = subprocess.run(command, cwd=ROOT / "server", env=environment,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (HERE / "server-native-verification.txt").write_text(result.stdout)
    sys.stdout.write(result.stdout)
    raise SystemExit(result.returncode)
