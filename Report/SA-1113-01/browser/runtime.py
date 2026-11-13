"""Isolated AI-pet acceptance runtime; all credentials, config and database stay in /tmp."""
from pathlib import Path
import argparse, hashlib, json, os, secrets, signal, socket, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[3]
META=Path('/tmp/sa-mechanical-pets-runtime.json')
def main():
 p=argparse.ArgumentParser();p.add_argument('--gm',action='store_true');a=p.parse_args()
 if META.exists():
  m=json.loads(META.read_text());r=Path(m['dir']);assert r.parent==Path('/tmp') and r.name.startswith('sa-mechanical-')
  if m.get('pid'):
   try:os.kill(m['pid'],0)
   except ProcessLookupError:pass
   else:raise RuntimeError('Existing private runtime still running')
 else:
  r=Path(tempfile.mkdtemp(prefix='sa-mechanical-'));r.chmod(0o700)
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  creds={'account':'mech'+secrets.token_hex(3),'password':secrets.token_urlsafe(18),'secret':secrets.token_hex(6),'character':'Mech'+secrets.token_hex(3)}
  private=r/'credentials.json';private.write_text(json.dumps(creds));private.chmod(0o600)
  m={'dir':str(r),'port':port,'credentials':str(private)}
 c=json.loads(Path(m['credentials']).read_text());binary=ROOT/'bin/saserver'
 config=f'''addr: 127.0.0.1:{m['port']}
data: {ROOT}/gamedata
assets: {ROOT}/assets
client: embedded
db: {r}/test.db
gms: [{c['account'] if a.gm else ''}]
groups:
 - name: Mechanical
   lines: [One]
rules:
 charMaxLevel: 200
 petMaxLevel: 180
 battleGoldRate: 1
 encounterRate: 100
 battleSpeed: 4
 enemyGuardRate: 0
 shareExp: true
 turnTime: 60
'''
 cfg=r/'config.yaml';cfg.write_text(config);cfg.chmod(0o600)
 log=(r/'server.log').open('a');os.chmod(r/'server.log',0o600)
 process=subprocess.Popen([str(binary)],cwd=r,stdout=log,stderr=subprocess.STDOUT)
 m.update(pid=process.pid,gm=a.gm,binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest());META.write_text(json.dumps(m));META.chmod(0o600)
 print(json.dumps({k:m[k] for k in ('dir','port','pid','gm','binary_sha256')}),flush=True)
 def stop(*_):
  if process.poll() is None:process.send_signal(signal.SIGTERM)
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 raise SystemExit(process.wait())
if __name__=='__main__':main()
