"""Retain complete verifier exit codes across foreground tool-session limits."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
NODE = '/tmp/sa-1113-04-tools/node-v26.13.1-linux-x64/bin/node'
parser = argparse.ArgumentParser()
parser.add_argument('--worker', action='store_true')
args = parser.parse_args()
if not args.worker:
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker'],
        start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL)
    print(json.dumps({'supervisor_pid': process.pid}))
    raise SystemExit(0)

def snapshot():
    paths = list((ROOT / 'server').rglob('*.go')) + list((ROOT / 'client/src').rglob('*.ts'))
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}

commands = [
    ([NODE, '--test', *[str(p) for p in sorted([*(ROOT / 'client/test').glob('*.test.ts'), *(ROOT / 'client/test').glob('*.test.mjs')])],
      str(ROOT / 'scripts/build-client.test.mjs')], ROOT, 'client-tests.txt'),
    ([NODE, '/home/coder/.npm/_npx/9ca470fa61f45e06/node_modules/typescript/lib/tsc.js',
      '--noEmit', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler',
      '--allowImportingTsExtensions', '--lib', 'es2022,dom,dom.iterable',
      *[str(p) for p in sorted((ROOT / 'client/src').glob('*.ts'))]], ROOT, 'typescript.txt'),
    (['go', 'test', '-p', '1', './...', '-count=1', '-timeout=900s'], ROOT / 'server', 'go-test.txt'),
    (['go', 'vet', '-p', '1', './...'], ROOT / 'server', 'go-vet.txt'),
    (['go', 'test', '-race', '-p', '1', './...', '-count=1', '-timeout=900s'], ROOT / 'server', 'go-race.txt'),
]
before = snapshot()
result = {'complete': False, 'success': False, 'commands': []}
status = OUT / 'checks-status.json'
status.write_text(json.dumps(result, indent=2) + '\n')
env = dict(os.environ, GOMAXPROCS='2', GOMEMLIMIT='600MiB')
for command, cwd, name in commands:
    start = time.monotonic()
    with (OUT / name).open('wb') as log:
        process = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    result['commands'].append({'command': command, 'exit_code': process.returncode,
                              'seconds': round(time.monotonic() - start, 3), 'log': name})
    status.write_text(json.dumps(result, indent=2) + '\n')
    if process.returncode:
        break
result.update(complete=True, source_stable=before == snapshot())
result['success'] = result['source_stable'] and len(result['commands']) == len(commands) and all(c['exit_code'] == 0 for c in result['commands'])
status.write_text(json.dumps(result, indent=2) + '\n')
