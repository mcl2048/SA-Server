#!/usr/bin/env python3
"""Export private loaded-resource endpoint evidence through a temporary Go overlay.

Example: python3 Report/SA-1121-01/navigation-export-graph.py --output /tmp/nav-graph.json
Add --all-native to include every parsed FREE/TO destination as a permissive
audit edge; those edges are never advertised by the product navigator.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--all-native', action='store_true')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
report = Path(__file__).resolve().parent
root = report.parents[1]
stem = 'navigation-allnative-graph' if args.all_native else 'navigation-global-graph'
test = 'TestNavigationAllNativeGraph' if args.all_native else 'TestNavigationGlobalGraph'
old = '/tmp/sa1121-navigation/allnative-graph.json' if args.all_native else '/tmp/sa1121-navigation/global-graph.json'
source = (report / (stem + '_test.go.txt')).read_text().replace(json.dumps(old), json.dumps(str(args.output.resolve())))
with tempfile.TemporaryDirectory(prefix='sa-navigation-graph-') as temporary:
    directory = Path(temporary)
    overlay_source = directory / 'graph_test.go'
    overlay_source.write_text(source)
    overlay = directory / 'overlay.json'
    overlay.write_text(json.dumps({'Replace': {str(root / 'server/internal/world/maptransfers_test.go'): str(overlay_source)}}))
    subprocess.run([os.environ.get('SA_GO', 'go'), 'test', '-overlay', str(overlay), './internal/world', '-run', '^' + test + '$', '-count=1'], cwd=root / 'server', check=True)
print(args.output.resolve())
