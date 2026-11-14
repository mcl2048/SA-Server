"""Retain command exit status separately from long-lived terminal sessions."""
from pathlib import Path
import argparse
import json
import os
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True)
parser.add_argument('--cwd', default='.')
parser.add_argument('--detach', action='store_true', help='Survive terminal session lifetime while retaining real child exit status')
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ['--'] else args.command
out = Path(__file__).resolve().parent
if args.detach:
    with (out/(args.name+'-supervisor.txt')).open('w') as supervisor:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--name', args.name,
                                  '--cwd', args.cwd, '--', *command], stdin=subprocess.DEVNULL,
                                 stdout=supervisor, stderr=subprocess.STDOUT, start_new_session=True, close_fds=True)
    print(json.dumps({'supervisor_pid': child.pid, 'name': args.name}))
    raise SystemExit(0)
status = out / (args.name + '-status.json')
started = time.time()
result = {'state': 'running', 'command': command, 'started': started}
status.write_text(json.dumps(result, indent=2) + '\n')
environment = dict(os.environ, PATH='/tmp/sa-1113-04-tools/node-v26.13.1-linux-x64/bin:' + os.environ['PATH'],
                   GOMAXPROCS='2', GOMEMLIMIT='400MiB')
with (out / (args.name + '.txt')).open('w') as log:
    child = subprocess.run(command, cwd=args.cwd, env=environment, stdout=log, stderr=subprocess.STDOUT)
result.update(state='finished', exit_code=child.returncode, seconds=round(time.time() - started, 3))
status.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(child.returncode)
