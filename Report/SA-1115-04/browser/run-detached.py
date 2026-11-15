"""Keep a complete real-browser matrix outside the tool's foreground timeout.

Private fixture metadata and credentials stay in the existing mode-0700 runtime.
The report receives only sanitized runner output, release digest and exit status.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--meta', required=True)
    parser.add_argument('--node', required=True)
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    meta = json.loads(Path(args.meta).read_text())
    runtime = Path(meta['dir'])
    if runtime.stat().st_mode & 0o077:
        raise RuntimeError('fixture runtime must remain private')
    if not args.worker:
        log = (runtime / 'browser-supervisor.log').open('ab')
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker',
                          '--meta', args.meta, '--node', args.node], cwd=ROOT,
                         stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                         start_new_session=True)
        log.close()
        return
    status = {'started': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'binary_sha256': hashlib.sha256(Path(meta['binary']).read_bytes()).hexdigest()}
    if status['binary_sha256'] != meta['binary_sha256']:
        raise RuntimeError('binary changed after fixture preparation')
    target = OUT / 'final-navigation-status.json'
    target.write_text(json.dumps(status, indent=2) + '\n')
    command = [args.node, 'Report/SA-1115-04/browser/real-game.mjs', '--variant', 'final',
               '--meta', args.meta, '--cases', './navigation-cases.mjs',
               '--result-name', 'final-navigation.json']
    with (OUT / 'final-navigation-run.txt').open('wb') as log:
        result = subprocess.run(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    status.update({'completed': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'exit_code': result.returncode})
    target.write_text(json.dumps(status, indent=2) + '\n')


if __name__ == '__main__':
    main()
