"""Own a dedicated final-ELF process until embedded HTTP checks and stop finish."""
from pathlib import Path
import json
import os
import signal
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
prepared = subprocess.run(['python3', str(OUT / 'browser/runtime.py'), '--variant', 'http'], cwd=ROOT, check=True, capture_output=True, text=True)
public = json.loads(prepared.stdout)
meta = json.loads(Path(public['meta']).read_text())
runtime = Path(meta['dir'])
result = {'binary_sha256': meta['binary_sha256'], 'checks_exit_code': None, 'sigterm_sent': False, 'exit_code': None}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with (runtime / 'server.log').open('a') as log:
    os.chmod(runtime / 'server.log', 0o600)
    child = subprocess.Popen([meta['binary']], cwd=runtime, stdout=log, stderr=subprocess.STDOUT,
                             env=dict(os.environ, GOMAXPROCS='2', GOMEMLIMIT='400MiB'))
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError('final ELF exited during HTTP startup')
            try:
                with opener.open(public['base'] + '/', timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.2)
        else:
            raise RuntimeError('final ELF HTTP startup timeout')
        check = subprocess.run(['python3', str(OUT / 'verify-delivery.py'), '--base', public['base']], cwd=ROOT)
        result['checks_exit_code'] = check.returncode
    finally:
        if child.poll() is None:
            result['sigterm_sent'] = True
            child.send_signal(signal.SIGTERM)
        try:
            result['exit_code'] = child.wait(timeout=30)
        except subprocess.TimeoutExpired:
            child.kill()
            result['exit_code'] = child.wait()
            result['forced_stop'] = True
(OUT / 'binary-http-shutdown.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
if result['checks_exit_code'] != 0 or result['exit_code'] != 0 or result.get('forced_stop'):
    raise SystemExit(1)
