"""Record the real Go race command and exit code independently of tool sessions.

An interrupted tool session is not a passing check. The detached worker owns
its test child, bounds its runtime, and writes a completion record only after
wait returns; the caller can inspect the record while continuing browser work.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
META = OUT / 'go-race-final.json'
GO = '/home/coder/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin/go'


def inputs():
    digest = hashlib.sha256()
    for path in sorted((ROOT / 'server').rglob('*.go')):
        if '/webclient/assets/' in str(path):
            continue
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
    for name in ('go.mod', 'go.sum'):
        digest.update((ROOT / 'server' / name).read_bytes())
    return digest.hexdigest()


def worker():
    before = inputs()
    command = [GO, 'test', '-race', '-count=1', '-buildvcs=false', './...']
    started = time.monotonic()
    env = dict(os.environ, GOMAXPROCS='2', GOMEMLIMIT='400MiB')
    result = {'command': command, 'source_sha256': before, 'started': time.time(), 'exit_code': None}
    META.write_text(json.dumps(result, indent=2) + '\n')
    with (OUT / 'go-race-final.txt').open('w') as log:
        child = subprocess.Popen(command, cwd=ROOT / 'server', env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=900)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                code = child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                code = child.wait()
            result['timed_out'] = True
    result.update(exit_code=code, elapsed_seconds=round(time.monotonic() - started, 3), inputs_unchanged=inputs() == before)
    META.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    if args.worker:
        worker()
    else:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        print(json.dumps({'worker_pid': child.pid, 'completion_record': str(META)}))
