"""Prepare a private, isolated real-ELF game fixture for Chromium acceptance.

SQLite backup is used for the prior test fixture. Runtime config, credentials,
database and server logs stay in a mode-0700 temporary directory, never Report.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import socket
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[3]


def prepare(variant, seed_meta='/tmp/sa-1113-03-runtime.json', override_binary=None, meta_output=None):
    old = json.loads(Path(seed_meta).read_text())
    target = Path(tempfile.mkdtemp(prefix=f'sa-1114-04-{variant}-'))
    target.chmod(0o700)
    credentials = target / 'credentials.json'
    credentials.write_bytes(Path(old['credentials']).read_bytes())
    credentials.chmod(0o600)
    source = sqlite3.connect(f"file:{old['dir']}/test.db?mode=ro", uri=True)
    destination = sqlite3.connect(target / 'test.db')
    source.backup(destination)
    destination.close()
    source.close()
    (target / 'test.db').chmod(0o600)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    account = json.loads(credentials.read_text())['account']
    data = target / 'gamedata'
    shutil.copytree(ROOT / 'gamedata', data)
    # Private controlled field for five-enemy layout; normal server encounter
    # parsing and choosing still run. This fixture is not a natural spawn claim.
    with (data / 'battle/group1.txt').open('ab') as stream:
        stream.write(b'\nfixture-five,90001,-1,-1,984,,,,,,,,,,1,,,,,,,,,\n')
    area = [90001, 300, 360, 170, 390, 200, 1, 5, 5, 1000000, 90001] + [''] * 9 + [1] + [''] * 9
    with (data / 'battle/encount.txt').open('ab') as stream:
        stream.write(('\n' + ','.join(map(str, area)) + '\n').encode())
    # Controlled five-reviver group reproduces flight -> resurrection ->
    # invisible-slot action through actual server data, never injected events.
    battle = data / 'battle'
    enemies = [line.split(',') for line in (battle / 'enemy1.txt').read_text(encoding='gbk', errors='replace').splitlines() if line and not line.startswith('#')]
    reference = next(c for c in enemies if len(c)>5 and c[3]=='9')
    templates = [line.split(',') for line in (battle / 'enemybase1.txt').read_text(encoding='gbk', errors='replace').splitlines() if line and not line.startswith('#')]
    original = next(c for c in templates if len(c)>36 and c[6]==reference[4])
    values = [0]*49
    values[:9] = [90002,100,0,10,1,50,300,30,0]
    values[13:19] = [100]*6
    values[19:26] = [500]+[-1]*6
    values[29:33] = [7,int(original[36]),0,0]
    rows = {
      'enemybase1.txt': ['FixtureReviver']+['']*5+values,
      'enemy1.txt': ['FixtureReviver','wa:1','',90002,90002,1,1,5,5,0,-1,0,0,0]+[-1]*10+[0]*10,
      'group1.txt': ['fixture-revivers',90002,-1,-1,90002]+[-1]*9+[1]+[0]*9,
      'encount.txt': [90002,300,410,190,420,200,1,1,5,1000001,90002]+[-1]*9+[1]+[0]*9,
    }
    for file, row in rows.items():
        with (battle/file).open('ab') as stream:
            stream.write(('\n'+','.join(map(str,row))+'\n').encode())
    # LER's existing no-flight sprites exercise HP0 without a fly event.
    ko_values=values.copy();ko_values[0]=90003;ko_values[30]=101813
    ko_rows={
      'enemybase1.txt':['FixtureKnockout']+['']*5+ko_values,
      'enemy1.txt':['FixtureKnockout','at:1;1;1','',90003,90003,1,1,1,1,0,-1,0,0,0]+[-1]*10+[0]*10,
    }
    for file,row in ko_rows.items():
        with (battle/file).open('ab') as stream:
            stream.write(('\n'+','.join(map(str,row))+'\n').encode())
    # A passive native opponent lets HP1 survive MP -> HP recovery. It uses
    # the real guard AI and ordinary data parser; no browser events are forged.
    gentle=values.copy();gentle[0]=90004;gentle[1]=30;gentle[19:26]=[-1]*7
    gentle_rows={
      'enemybase1.txt':['FixtureRecoveryGuard']+['']*5+gentle,
      'enemy1.txt':['FixtureRecoveryGuard','gu:1','',90004,90004,1,1,1,1,0,-1,0,0,0]+[-1]*10+[0]*10,
    }
    for file,row in gentle_rows.items():
        with (battle/file).open('ab') as stream:
            stream.write(('\n'+','.join(map(str,row))+'\n').encode())
    # A private native group retains enough HP for Lilith's normal attack and
    # ranged storm to be inspected across real turns. Only guard tactics run;
    # the normal encounter picker still decides 1..5 opponents. The browser
    # retries actual encounters until it gets a group of at least three.
    storm=values.copy()
    storm[:9]=[90005,1000,0,80,0,0,0,30,0]
    storm[13:19]=[0]*6
    storm[19:26]=[-1]*7
    storm[27:29]=[0,0]
    storm_rows={
      'enemybase1.txt':['FixtureCannonGuard']+['']*5+storm,
      'enemy1.txt':['FixtureCannonGuard','gu:1','',90005,90005,1,1,5,1,0,-1,0,0,1]+[-1]*10+[0]*10,
      'group1.txt':['fixture-storm-guards',90005,-1,-1,90005]+[-1]*9+[1]+[0]*9,
      'encount.txt':[90005,300,445,225,455,235,1,1,5,1000002,90005]+[-1]*9+[1]+[0]*9,
    }
    for file,row in storm_rows.items():
        with (battle/file).open('ab') as stream:
            stream.write(('\n'+','.join(map(str,row))+'\n').encode())
    binary = Path(override_binary) if override_binary else Path('/tmp/sa-1114-04-baseline/saserver') if variant == 'baseline' else ROOT / 'bin/saserver'
    if variant == 'candidate':
        source_binary = binary
        binary = target / 'saserver'
        shutil.copy2(source_binary, binary)
    config = f'''addr: 127.0.0.1:{port}
data: {data}
assets: {ROOT}/assets
client: embedded
db: {target}/test.db
gms: [{account}]
minimapReveal: 1
groups:
 - name: Acceptance04
   lines: [Fixture]
rules:
 charMaxLevel: 200
 petMaxLevel: 180
 battleSpeed: 2
 enemyGuardRate: 1
 turnTime: 300
'''
    (target / 'config.yaml').write_text(config)
    (target / 'config.yaml').chmod(0o600)
    meta = {'dir': str(target), 'port': port, 'credentials': str(credentials),
            'binary': str(binary), 'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
    path = Path(meta_output) if meta_output else Path(f'/tmp/sa-1114-04-runtime-{variant}.json')
    path.write_text(json.dumps(meta))
    path.chmod(0o600)
    print(json.dumps({'meta': str(path), 'base': f'http://127.0.0.1:{port}', 'sha256': meta['binary_sha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--variant', choices=('baseline', 'candidate', 'final', 'http'), default='final')
    parser.add_argument('--seed-meta', default='/tmp/sa-1113-03-runtime.json', help='Private seed metadata with dir/test.db and credentials path')
    parser.add_argument('--binary', help='Override baseline/final ELF path')
    parser.add_argument('--meta', help='Independent private metadata path for parallel browser runtimes')
    args = parser.parse_args()
    prepare(args.variant, args.seed_meta, args.binary, args.meta)
