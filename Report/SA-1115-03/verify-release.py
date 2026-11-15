"""Fail closed when tested production inputs, final ELF, or public ZIP diverge."""
from pathlib import Path
import hashlib
import json
import re
import struct
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
VERSION = 'v0.2.21-LYNX'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    binary = ROOT / 'bin/saserver'
    digest = sha(binary)
    assert subprocess.check_output([str(binary), '--version'], text=True).strip() == VERSION
    elf = binary.read_bytes()
    assert elf[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', elf, 18)[0] == 62
    offset = struct.unpack_from('<Q', elf, 32)[0]
    size, count = struct.unpack_from('<HH', elf, 54)
    assert all(struct.unpack_from('<I', elf, offset + i * size)[0] != 3 for i in range(count)), 'dynamic interpreter in ELF'
    assert binary.stat().st_mode & 0o111
    assert (ROOT / 'bin/saserver.sha256').read_text().split()[0] == digest
    inputs = json.loads((OUT / 'production-inputs.json').read_text())
    assert inputs['binary_sha256'] == digest
    for rel, expected in inputs['files'].items():
        assert sha(ROOT / rel) == expected, rel
    repeat = json.loads((OUT / 'build-repeatability.json').read_text())
    assert repeat['identical'] and repeat['binary_sha256'] == digest
    client = (OUT / 'final-client-tests.txt').read_text()
    client_count = int(re.search(r'pass (\d+)\b', client)[1])
    assert client_count >= 250 and re.search(r'fail 0\b', client)
    assert not (OUT / 'final-typescript-all.txt').read_text().strip()
    checks = json.loads((OUT / 'go-checks.json').read_text())
    assert checks['success'] and all(c['exit_code'] == 0 for c in checks['commands'])
    for name in ('go-test-final.txt', 'go-race.txt'):
        text = (OUT / name).read_text()
        for package in ('cmd/saserver', 'internal/battle', 'internal/data', 'internal/server', 'internal/store', 'internal/world', 'webclient'):
            assert re.search(r'^ok\s+sa/server/' + package + r'\s', text, re.M), (name, package)
        assert not re.search(r'^FAIL\b|WARNING: DATA RACE', text, re.M), name
    http = json.loads((OUT / 'http-content.json').read_text())
    assert http['success'] and http['binary_sha256'] == digest and http['matched'] == 78
    assert http['shutdown']['exit_code'] == 0
    for entry in http['files']:
        url = entry['url'].lstrip('/')
        path = ROOT / url if url.startswith('assets/') else ROOT / 'server/webclient/static' / url
        assert sha(path) == entry['sha256'], url
    browsers = {}
    for name in ('automation', 'navigation'):
        browser = json.loads((OUT / f'browser/final-{name}.json').read_text())
        assert browser['binary_sha256'] == digest and browser['binary_version'] == VERSION
        assert not browser.get('failure') and not browser.get('errors'), name
        assert browser['checks'] and all(c['passed'] is True for c in browser['checks'])
        assert all(any(c['device'] == device for c in browser['checks']) for device in ('desktop', 'mobile'))
        shutdown = browser['shutdown']
        assert shutdown['exit_code'] == 0 and not shutdown['timed_out'] and shutdown['position_matches']
        browsers[name] = {'checks': len(browser['checks']), 'browser': browser['browser'], 'shutdown': shutdown}
    archive = ROOT / 'bin' / f'saserver-{VERSION}-linux-amd64.zip'
    prefix = f'saserver-{VERSION}/'
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert len(names) == len(set(names))
        for name in names:
            assert name.startswith(prefix), name
            rel = name[len(prefix):]
            assert not rel.startswith(('assets/', 'Assets/')) and not rel.endswith(('.db', '.sqlite', '.db-wal', '.db-shm'))
            assert 'config.local' not in rel and '..' not in Path(rel).parts
            assert z.read(name) == (ROOT / rel).read_bytes(), rel
        assert z.getinfo(prefix + 'bin/saserver').external_attr >> 16 & 0o111
        assert prefix + 'docs/skills/stoneage/references/pet-storage-training.md' in names
    assert (archive.with_name(archive.name + '.sha256')).read_text().split()[0] == sha(archive)
    assert list((ROOT / 'bin').glob('*.zip')) == [archive], 'stale release ZIP remains'
    result = {
        'success': True, 'version': VERSION, 'binary_sha256': digest,
        'binary_bytes': binary.stat().st_size, 'linux_amd64_static': True,
        'production_inputs': len(inputs['files']), 'repeated_build_identical': True,
        'client_tests': client_count, 'go_test_race_vet': True, 'http_files': http['matched'],
        'browser': browsers,
        'package': {'path': str(archive.relative_to(ROOT)), 'bytes': archive.stat().st_size, 'files': len(names), 'sha256': sha(archive)},
        'limitations': ['Chromium viewport/touch emulation; no physical Android/iOS/Safari certification', 'Isolated fixtures; production was not restarted'],
    }
    (OUT / 'release.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
