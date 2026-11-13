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


def prepare(variant):
    old = json.loads(Path('/tmp/sa-1113-03-runtime.json').read_text())
    target = Path(tempfile.mkdtemp(prefix=f'sa-1113-04-{variant}-'))
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
    binary = Path('/tmp/sa-1113-04-baseline/saserver') if variant == 'baseline' else ROOT / 'bin/saserver'
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
 enemyGuardRate: 0
 turnTime: 300
'''
    (target / 'config.yaml').write_text(config)
    (target / 'config.yaml').chmod(0o600)
    meta = {'dir': str(target), 'port': port, 'credentials': str(credentials),
            'binary': str(binary), 'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
    path = Path(f'/tmp/sa-1113-04-runtime-{variant}.json')
    path.write_text(json.dumps(meta))
    path.chmod(0o600)
    print(json.dumps({'meta': str(path), 'base': f'http://127.0.0.1:{port}', 'sha256': meta['binary_sha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--variant', choices=('baseline', 'candidate', 'final', 'http'), default='final')
    prepare(parser.parse_args().variant)
