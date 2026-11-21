"""Copy an isolated test account; use unmodified current game data and real ELF.

The seed is a private historical test fixture, never a production DB. Credentials,
SQLite, configuration and server logs remain outside the repository at mode 0700.
All business actions after startup use the actual UI and server GM commands.
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', default=str(ROOT / 'bin/saserver'))
    parser.add_argument('--meta', required=True)
    parser.add_argument('--seed-meta', default='/tmp/sa-1113-03-runtime.json')
    args = parser.parse_args()
    old = json.loads(Path(args.seed_meta).read_text())
    target = Path(tempfile.mkdtemp(prefix='sa112101-browser-'))
    target.chmod(0o700)
    credentials = target / 'credentials.json'
    credentials.write_bytes(Path(old['credentials']).read_bytes())
    credentials.chmod(0o600)
    with sqlite3.connect(f"file:{old['dir']}/test.db?mode=ro", uri=True) as source:
        with sqlite3.connect(target / 'test.db') as destination:
            source.backup(destination)
    (target / 'test.db').chmod(0o600)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    account = json.loads(credentials.read_text())['account']
    config = {
        'addr': f'127.0.0.1:{port}', 'data': str(ROOT / 'gamedata'),
        'assets': str(ROOT / 'assets'), 'client': 'embedded',
        'db': str(target / 'test.db'), 'gms': [account], 'minimapReveal': 1,
        'groups': [{'name': 'Acceptance', 'lines': ['Isolated']}],
        'rules': {'charMaxLevel': 200, 'petMaxLevel': 200, 'battleSpeed': 4,
                  'enemyGuardRate': 0, 'turnTime': 300},
    }
    (target / 'config.yaml').write_text(json.dumps(config))
    (target / 'config.yaml').chmod(0o600)
    binary = target / 'saserver'
    shutil.copy2(Path(args.binary), binary)
    meta = {'dir': str(target), 'port': port, 'credentials': str(credentials),
            'binary': str(binary), 'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
    path = Path(args.meta)
    path.write_text(json.dumps(meta))
    path.chmod(0o600)
    print('Prepared private real-data runtime; no encounter overrides.')


if __name__ == '__main__':
    main()
