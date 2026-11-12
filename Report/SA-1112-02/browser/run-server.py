"""Run the final binary with an isolated SQLite fixture. Never use production config.
Requires existing /tmp/sa-release-review-runtime.json from input fixture setup.
Writes /tmp-only connection metadata; no credentials are printed.
"""
from pathlib import Path
import subprocess,json,hashlib,signal,os
root=Path(__file__).resolve().parents[3]
review_path=Path('/tmp/sa-release-review-runtime.json')
meta=json.loads(review_path.read_text());runtime=Path(meta['dir']).resolve()
assert runtime.parent==Path('/tmp') and runtime.name.startswith('sa-input-review-')
config=runtime/'config.yaml';original=config.read_text()
gm='finalreleasefixt'  # Native account fields allow at most 15 characters.
lines=[line for line in original.splitlines() if not line.startswith(('client:','gms:'))]
config.write_text('\n'.join(lines)+f'\nclient: embedded\ngms: [{gm}]\n')
binary=root/'bin/saserver'
process=subprocess.Popen([str(binary)],cwd=runtime)
meta.update(pid=process.pid,client_mode='embedded',binary=str(binary),sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),gm_account=gm)
review_path.write_text(json.dumps(meta));review_path.chmod(0o600)
final=Path('/tmp/sa-release-final-runtime.json');final.write_text(json.dumps(meta));final.chmod(0o600)
print(json.dumps({k:meta[k] for k in ('port','dir','pid','client_mode','sha256')}),flush=True)
def stop(*_):
    if process.poll() is None:process.send_signal(signal.SIGTERM)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
raise SystemExit(process.wait())
