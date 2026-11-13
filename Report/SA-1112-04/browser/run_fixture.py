"""Run the isolated upgrade fixture; never touches repository databases.
First run without --gm and create both accounts using gameplay_acceptance.py --seed.
Stop cleanly, then restart with --gm for the actual upgrade acceptance.
"""
from pathlib import Path
import argparse, hashlib, json, os, secrets, signal, socket, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[3]
META = Path(os.environ.get('SA_UPGRADE_META', '/tmp/sa-upgrade-runtime.json'))
parser = argparse.ArgumentParser()
parser.add_argument('--gm', action='store_true')
parser.add_argument('--external-client', action='store_true')
parser.add_argument('--binary', default=str(ROOT/'bin/saserver'))
args = parser.parse_args()
if META.exists():
    meta=json.loads(META.read_text()); runtime=Path(meta['dir']).resolve()
    assert runtime.parent==Path('/tmp') and runtime.name.startswith('sa-upgrade-')
    if meta.get('pid'):
        try: os.kill(meta['pid'],0)
        except ProcessLookupError: pass
        else: raise RuntimeError('An existing fixture server is still running')
else:
    runtime=Path(tempfile.mkdtemp(prefix='sa-upgrade-'))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    suffix=secrets.token_hex(2)
    credentials=[{'account':'upga'+suffix,'password':secrets.token_urlsafe(12),'secret':secrets.token_hex(5),'character':'UpgA'+suffix},
                 {'account':'upgb'+suffix,'password':secrets.token_urlsafe(12),'secret':secrets.token_hex(5),'character':'UpgB'+suffix}]
    private=runtime/'credentials.json'; private.write_text(json.dumps(credentials));private.chmod(0o600)
    meta={'dir':str(runtime),'port':port,'credentials':str(private)}
credentials=json.loads(Path(meta['credentials']).read_text())
binary=Path(args.binary).resolve();assert binary.is_file()
client=str(ROOT/'client') if args.external_client else 'embedded'
gms=', '.join(x['account'] for x in credentials) if args.gm else ''
config=f'''addr: 127.0.0.1:{meta['port']}
data: {ROOT}/gamedata
assets: {ROOT}/assets
client: {client}
db: {runtime}/test.db
gms: [{gms}]
groups:
  - name: Upgrade
    lines: [One]
rules:
  charMaxLevel: 200
  petMaxLevel: 180
  charMaxTrans: 12
  petMaxTrans: 8
  battleGoldRate: 1
  encounterRate: 100
  battleSpeed: 4
  enemyGuardRate: 0
  shareExp: true
  turnTime: 30
'''
(runtime/'config.yaml').write_text(config)
logfile=(runtime/'server.log').open('a')
process=subprocess.Popen([str(binary)],cwd=runtime,stdout=logfile,stderr=subprocess.STDOUT)
meta.update(pid=process.pid,gm=args.gm,binary=str(binary),sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),client_mode=client)
META.write_text(json.dumps(meta));META.chmod(0o600)
print(json.dumps({k:meta[k] for k in ('dir','port','pid','gm','client_mode','sha256')}),flush=True)
def stop(*_):
    if process.poll() is None: process.send_signal(signal.SIGTERM)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
status=process.wait();logfile.close();raise SystemExit(status)
