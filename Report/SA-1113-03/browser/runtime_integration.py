"""Private isolated final-ELF runner. Own the child until SIGTERM + wait finish.
Clone the previous fixture using SQLite backup, never copy a live DB alone.
No credentials, tokens, config, database or server logs are public artifacts.
"""
from pathlib import Path
import hashlib,json,os,shutil,signal,socket,sqlite3,subprocess,tempfile,time,urllib.request
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
META=Path('/tmp/sa-1113-03-runtime.json')

def prepare():
 old=json.loads(Path('/tmp/sa-1113-02-runtime.json').read_text())
 r=Path(tempfile.mkdtemp(prefix='sa-battle03-'));r.chmod(0o700)
 credentials=r/'credentials.json';credentials.write_bytes(Path(old['credentials']).read_bytes());credentials.chmod(0o600)
 src=sqlite3.connect(f"file:{old['dir']}/test.db?mode=ro",uri=True)
 dst=sqlite3.connect(r/'test.db');src.backup(dst);dst.close();src.close();(r/'test.db').chmod(0o600)
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 c=json.loads(credentials.read_text())
 # Private encounter override: enemy984 has CreateMax5. Restrict to a small
 # existing walkable field rectangle; real server picker still chooses 1..5.
 data=r/'gamedata';shutil.copytree(ROOT/'gamedata',data)
 with (data/'battle/group1.txt').open('ab') as f:f.write(b'\nfixture-five,90001,-1,-1,984,,,,,,,,,,1,,,,,,,,,\n')
 area=[90001,300,360,170,390,200,1,5,5,1000000,90001]+['']*9+[1]+['']*9
 with (data/'battle/encount.txt').open('ab') as f:f.write(('\n'+','.join(map(str,area))+'\n').encode())
 (r/'config.yaml').write_text(f'''addr: 127.0.0.1:{port}
data: {data}
assets: {ROOT}/assets
client: embedded
db: {r}/test.db
gms: [{c['account']}]
groups:
 - name: Battle03
   lines: [Fixture]
rules:
 charMaxLevel: 200
 petMaxLevel: 180
 battleSpeed: 2
 enemyGuardRate: 0
 turnTime: 300
''');(r/'config.yaml').chmod(0o600)
 binary=ROOT/'bin/saserver'
 m={'dir':str(r),'port':port,'credentials':str(credentials),'binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest()}
 META.write_text(json.dumps(m));META.chmod(0o600)
 return m

def run(callback):
 m=prepare();r=Path(m['dir']);binary=ROOT/'bin/saserver'
 with (r/'server.log').open('a') as log:
  os.chmod(r/'server.log',0o600)
  child=subprocess.Popen([str(binary)],cwd=r,stdout=log,stderr=subprocess.STDOUT)
  expected=None;error=None
  try:
   deadline=time.monotonic()+90
   while time.monotonic()<deadline:
    if child.poll() is not None:raise RuntimeError('ELF exited during startup')
    try:
     with urllib.request.urlopen(f"http://127.0.0.1:{m['port']}/",timeout=2) as res:
      if res.status==200:break
    except OSError:time.sleep(.2)
   else:raise RuntimeError('HTTP startup timeout')
   expected=callback(m)
   subprocess.run(['python3',str(ROOT/'Report/SA-1113-03/verify-delivery.py'),'--base',f"http://127.0.0.1:{m['port']}"],cwd=ROOT,check=True,capture_output=True)
  except BaseException as e:error=e
  finally:
   sent=child.poll() is None
   if sent:child.send_signal(signal.SIGTERM)
   try:code=child.wait(timeout=30)
   except subprocess.TimeoutExpired:
    child.kill();child.wait();raise RuntimeError('ELF failed to stop within 30s')
   actual=None
   if expected:
    with sqlite3.connect(r/'test.db') as db:
     row=db.execute('SELECT floor,x,y FROM characters WHERE id=?',(expected['id'],)).fetchone()
    actual=dict(zip(('floor','x','y'),row)) if row else None
   result={'binary_sha256':m['binary_sha256'],'sigterm_sent':sent,'exit_code':code,'expected_position':expected,'stored_position':actual,'position_matches':bool(expected) and actual=={k:expected[k] for k in ('floor','x','y')},'fixture':'private SQLite backup of prior test fixture; GM-controlled scenarios'}
   (OUT/'runtime-shutdown.json').write_text(json.dumps(result,indent=2)+'\n')
   if code!=0:raise RuntimeError(f'ELF shutdown exit {code}')
   if expected and not result['position_matches']:raise RuntimeError('saved position mismatch')
  if error:raise error
  return m
