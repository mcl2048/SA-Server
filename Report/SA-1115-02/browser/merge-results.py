"""Merge independently completed real-browser passes after checking provenance.

The main JSON keeps its own events, scope and owned-instance shutdown. The
landscape JSON stays independently inspectable with its separately supervised
Node return code and its own server shutdown/SQLite verification.
"""
from pathlib import Path
import json

OUT = Path(__file__).resolve().parent
main = json.loads((OUT / 'final-main-petcare.json').read_text())
raw = (OUT / 'final-petcare.json').read_bytes()
landscape = json.loads(raw)
if len(landscape['checks']) != 3:
    raw = (OUT / 'final-landscape-petcare.json').read_bytes()
    landscape = json.loads(raw)
process = json.loads((OUT / 'landscape-process.json').read_text())
assert len(main['checks']) == 23 and len(landscape['checks']) == 3
assert process['returncode'] == 0, process
assert main['binary_sha256'] == landscape['binary_sha256']
assert main['binary_version'] == landscape['binary_version'] == 'v0.2.20-LYNX'
for result in (main, landscape):
    assert all(check['passed'] for check in result['checks'])
    assert not result['errors'] and 'failure' not in result
    assert result['shutdown']['exit_code'] == 0
    assert not result['shutdown']['timed_out']
    assert result['shutdown']['sigterm_sent']
    assert result['shutdown']['position_matches']
(OUT / 'final-landscape-petcare.json').write_bytes(raw)
main['checks'].extend(landscape['checks'])
main['supplementary'] = {
    'landscape': {
        'json': 'final-landscape-petcare.json',
        'binary_sha256': landscape['binary_sha256'],
        'checks': len(landscape['checks']),
        'scope': landscape['scope'],
        'shutdown': landscape['shutdown'],
        'child_returncode': process['returncode'],
        'elapsed_seconds': process['elapsed_seconds'],
    }
}
(OUT / 'final-petcare.json').write_text(json.dumps(main, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'checks': len(main['checks']), 'sha256': main['binary_sha256'], 'landscape_child_rc': process['returncode']}))
