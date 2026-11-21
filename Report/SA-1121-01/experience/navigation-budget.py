#!/usr/bin/env python3
"""Reproduce the Linux-only read-only navigation budget audit with a Go overlay."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

here = Path(__file__).resolve().parent
repo = here.parents[2]
with tempfile.TemporaryDirectory(prefix="sa112101-nav-budget-") as temporary:
    directory = Path(temporary)
    source = directory / "navigation_review_test.go"
    shutil.copyfile(here / "navigation-budget_test.go.txt", source)
    overlay = directory / "overlay.json"
    virtual = repo / "server/internal/world/sa112101_nav_independent_review_test.go"
    overlay.write_text(json.dumps({"Replace": {str(virtual): str(source)}}))
    command = [os.environ.get("SA_GO", "go"), "test", "-overlay", str(overlay),
               "./internal/world", "-run", "^TestIndependentNavigationColdRequestBudget$",
               "-count=1", "-v"]
    environment = os.environ.copy()
    environment["GOMAXPROCS"] = "2"
    subprocess.run(command, cwd=repo / "server", env=environment, check=True)
    shutil.copyfile("/tmp/sa112101-nav-budget.json", here / "navigation-budget.json")
