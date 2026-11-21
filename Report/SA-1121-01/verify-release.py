"""Join fresh test evidence, served bytes, native browser results and public ZIP."""
from pathlib import Path
import hashlib
import json
import re
import struct
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
VERSION = 'v0.2.23-LYNX'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    binary = ROOT / 'bin/saserver'
    digest, elf = sha(binary), binary.read_bytes()
    assert subprocess.check_output([str(binary), '--version'], text=True).strip() == VERSION
    assert elf[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', elf, 18)[0] == 62
    off = struct.unpack_from('<Q', elf, 32)[0]
    size, count = struct.unpack_from('<HH', elf, 54)
    assert all(struct.unpack_from('<I', elf, off + i * size)[0] != 3 for i in range(count))
    assert binary.stat().st_mode & 0o111
    assert (ROOT / 'bin/saserver.sha256').read_text().split()[0] == digest
    inputs = json.loads((OUT / 'production-inputs.json').read_text())
    assert inputs['binary_sha256'] == digest
    for rel, expected in inputs['files'].items():
        assert sha(ROOT / rel) == expected, rel
    repeat = json.loads((OUT / 'build-repeatability.json').read_text())
    assert repeat['identical'] and repeat['binary_sha256'] == digest
    status = json.loads((OUT / 'checks-status.json').read_text())
    assert status['complete'] and status['success'] and status['source_stable']
    assert len(status['commands']) == 5 and all(c['exit_code'] == 0 for c in status['commands'])
    client = (OUT / 'client-tests.txt').read_text()
    passed = int(re.search(r'pass (\d+)\b', client)[1])
    assert passed >= 274 and re.search(r'fail 0\b', client)
    assert not (OUT / 'typescript.txt').read_text().strip()
    assert not (OUT / 'go-vet.txt').read_text().strip()
    for name in ('go-test.txt', 'go-race.txt'):
        log = (OUT / name).read_text()
        assert not re.search(r'^FAIL\b|WARNING: DATA RACE', log, re.M)
        for package in ('cmd/saserver', 'internal/battle', 'internal/data', 'internal/server',
                        'internal/store', 'internal/world', 'tests', 'webclient'):
            assert re.search(r'^ok\s+sa/server/' + package + r'\s', log, re.M), (name, package)
    http = json.loads((OUT / 'http-content.json').read_text())
    assert http['success'] and http['binary_sha256'] == digest and http['shutdown']['exit_code'] == 0
    for item in http['files']:
        rel = item['url'].lstrip('/')
        path = ROOT / rel if rel.startswith('assets/') else ROOT / 'server/webclient/static' / rel
        assert sha(path) == item['sha256'], rel
    browser = json.loads((OUT / 'browser/final.json').read_text())
    browser_status = json.loads((OUT / 'browser/final-status.json').read_text())
    assert browser_status['binary_sha256'] == digest and browser_status['exit_code'] == 0
    assert browser['binary_sha256'] == digest and browser['binary_version'] == VERSION
    assert not browser.get('failure') and not browser.get('errors') and not browser.get('shutdown_error')
    assert any(s['stage'] == 'scenario-finished' for s in browser['stages'])
    assert browser['checks'] and all(c['passed'] for c in browser['checks'])
    expected = {'Sea of Tears NPC via real same-floor portal', 'sea-exit: native exit navigation',
                'manual direction cancels a portal navigation intent',
                'nyx-return-passage: native NPC navigation', 'eden-west-ordinary: native NPC navigation'}
    expected.update(f'patched native experience for enemy {enemy} level {level}'
                    for enemy, level in ((1969, 130), (1971, 140), (2165, 130), (2168, 140), (2239, 80)))
    for device in ('desktop', 'mobile'):
        wanted = expected | ({'mobile native map survives landscape rotation'} if device == 'mobile' else set())
        actual = [c['name'] for c in browser['checks'] if c['device'] == device]
        assert len(actual) == len(wanted) and set(actual) == wanted, (device, actual)
    rotation = next(c for c in browser['checks'] if c['name'] == 'mobile native map survives landscape rotation')
    assert rotation['evidence']['inputsRemoved']
    assert browser['shutdown']['exit_code'] == 0 and browser['shutdown']['position_matches']
    archive = ROOT / 'bin' / f'saserver-{VERSION}-linux-amd64.zip'
    prefix = f'saserver-{VERSION}/'
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert len(names) == len(set(names))
        for name in names:
            assert name.startswith(prefix)
            rel = name[len(prefix):]
            assert not rel.lower().startswith('assets/') and '..' not in Path(rel).parts
            assert not rel.endswith(('.db', '.sqlite', '.db-wal', '.db-shm')) and 'config.local' not in rel
            assert z.read(name) == (ROOT / rel).read_bytes(), rel
        assert z.getinfo(prefix + 'bin/saserver').external_attr >> 16 & 0o111
        assert prefix + f'docs/{VERSION}.md' in names
    assert archive.with_name(archive.name + '.sha256').read_text().split()[0] == sha(archive)
    assert list((ROOT / 'bin').glob('*.zip')) == [archive]
    result = {'success': True, 'version': VERSION, 'binary_sha256': digest,
              'linux_amd64_static': True, 'binary_bytes': binary.stat().st_size,
              'repeat_identical': True, 'client_tests': passed, 'go_test_race_vet': True,
              'typescript': True, 'http_files': http['matched'],
              'browser': {'checks': len(browser['checks']), 'version': browser['browser'],
                          'shutdown': browser['shutdown']},
              'package': {'path': str(archive.relative_to(ROOT)), 'bytes': archive.stat().st_size,
                          'files': len(names), 'sha256': sha(archive)},
              'limits': ['Real Chromium viewport/touch emulation, no physical-device certification',
                         'No production deployment or restart',
                         'Quest, conditional and dialogue teleport eligibility remains server-owned']}
    (OUT / 'release.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
