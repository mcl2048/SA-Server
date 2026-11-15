"""Own a detached verifier so terminal-session teardown cannot lose exit status."""
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
parser = argparse.ArgumentParser()
parser.add_argument('--worker', action='store_true')
parser.add_argument('--race', action='store_true')
args = parser.parse_args()
status_path = OUT / ('go-race-status.json' if args.race else 'go-normal-status.json')
if not args.worker:
    # The child owns only its own test processes. No broad process-group cleanup.
    process = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), '--worker'] + (['--race'] if args.race else []),
        start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print(json.dumps({'supervisor_pid': process.pid, 'status': str(status_path.relative_to(ROOT))}))
    raise SystemExit(0)

env = dict(os.environ, GOMAXPROCS='2', GOMEMLIMIT='600MiB')
commands = [(['go', 'test', '-race', '-p', '1', './...', '-count=1', '-timeout=240s'], 'go-race.txt')] if args.race else [
    (['go', 'test', '-p', '1', './...', '-count=1', '-timeout=180s'], 'go-test-final.txt'),
    (['go', 'vet', '-p', '1', './...'], 'go-vet-final.txt'),
    (['go', 'test', '-race', '-p', '1', './...', '-count=1', '-timeout=240s'], 'go-race.txt'),
]
result = {'complete': False, 'commands': [], 'success': False}
snapshot = lambda: {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / 'server').rglob('*.go')}
before = snapshot()
status_path.write_text(json.dumps(result, indent=2) + '\n')
for command, name in commands:
    started = time.monotonic()
    with (OUT / name).open('wb') as log:
        process = subprocess.run(command, cwd=ROOT / 'server', env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    result['commands'].append({'command': command, 'exit_code': process.returncode, 'seconds': round(time.monotonic() - started, 3), 'log': name})
    status_path.write_text(json.dumps(result, indent=2) + '\n')
    if process.returncode:
        break
result['complete'] = True
result['source_stable'] = before == snapshot()
result['success'] = result['source_stable'] and len(result['commands']) == len(commands) and all(c['exit_code'] == 0 for c in result['commands'])
status_path.write_text(json.dumps(result, indent=2) + '\n')
