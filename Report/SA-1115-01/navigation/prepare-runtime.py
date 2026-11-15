"""Private real-server navigation fixture; credentials and SQLite never enter Report.

Uses the established fixture's SQLite backup and real game-data parser. Only the
private encounter-rate rule is increased so route suspension is reproducible.
"""
from pathlib import Path
import argparse
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--binary', required=True)
parser.add_argument('--meta', default='/tmp/sa-1115-navigation-runtime.json')
parser.add_argument('--seed-meta', default='/tmp/sa-1113-03-runtime.json')
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('previous_runtime', ROOT / 'Report/SA-1114-05/browser/runtime.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.prepare('candidate', args.seed_meta, args.binary, args.meta)
meta = json.loads(Path(args.meta).read_text())
config = Path(meta['dir']) / 'config.yaml'
text = config.read_text()
assert ' battleSpeed: 2' in text
config.write_text(text.replace(' battleSpeed: 2', ' encounterRate: 10000\n battleSpeed: 2'))
