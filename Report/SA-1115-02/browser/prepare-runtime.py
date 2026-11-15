"""Private fixture for the actual release ELF, official assets, and SQLite.

The inherited test account is copied through SQLite backup. Its credentials,
config, DB and server log stay in a new private temporary directory. The pool
starts with 498 ordinary pets and one already training pet; browser UI performs every business mutation.
"""
from pathlib import Path
import argparse
import copy
import importlib.util
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--binary', required=True)
parser.add_argument('--meta', default='/tmp/sa-1115-02-petcare-runtime.json')
parser.add_argument('--seed-meta', default='/tmp/sa-1113-03-runtime.json')
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('previous_runtime', ROOT / 'Report/SA-1114-05/browser/runtime.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
previous.prepare('candidate', args.seed_meta, args.binary, args.meta)
meta = json.loads(Path(args.meta).read_text())
with sqlite3.connect(Path(meta['dir']) / 'test.db') as db:
    bag = json.loads(db.execute('SELECT pets FROM characters WHERE id=1').fetchone()[0])
    reference = next(p for p in bag['pets'] if p)
    bag['pool'] = []
    for i in range(1, 499):
        pet = copy.deepcopy(reference)
        pet['free'] = f'寄放{i:03d}'
        pet['exp'] = 0
        pet.pop('training', None)
        pet.pop('away', None)
        pet.pop('guard', None)
        bag['pool'].append(pet)
    training = copy.deepcopy(reference)
    training.update(free='已有培养', training=True, exp=0)
    bag['pool'].append(training)
    bag.update(pets=[None] * 5, battle=-1, standby=0, ride=-1)
    db.execute('UPDATE characters SET pets=?,floor=1003,x=12,y=14,dir=4,level=50,exp=0,gold=100000,hp=-1,mp=-1 WHERE id=1', (json.dumps(bag, ensure_ascii=False),))
print('Prepared private pool fixture: 498 ordinary pets + one existing training pet, five empty carried slots.')
