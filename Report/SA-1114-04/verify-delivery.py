"""Verify a running final ELF serves the exact matched embedded client."""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import struct
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
VERSION = 'v0.2.15-LYNX'
parser = argparse.ArgumentParser()
parser.add_argument('--base', required=True)
args = parser.parse_args()
BASE = args.base.rstrip('/')
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def request(path, method='GET', headers=None):
    return OPENER.open(urllib.request.Request(BASE + path, method=method, headers=headers or {}), timeout=15)


files = [ROOT / 'client/index.html', *sorted((ROOT / 'client/dist').glob('*.js')), ROOT / 'client/art/login.png']
inputs = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in files}
subprocess.run(['node', 'client/build.mjs'], cwd=ROOT, check=True, capture_output=True)
assert inputs == {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in files}, 'client build is not repeatable'
served = []
for path in files:
    relative = path.relative_to(ROOT / 'client').as_posix()
    url = '/' if relative == 'index.html' else '/' + relative
    data = path.read_bytes()
    with request(url) as response:
        assert response.read() == data, relative
        assert response.headers.get('X-Content-Type-Options') == 'nosniff'
        expected_cache = 'no-store' if relative == 'index.html' else 'no-cache'
        assert response.headers.get('Cache-Control') == expected_cache, (relative, response.headers.get('Cache-Control'))
        etag = response.headers.get('ETag')
        assert etag
    if relative.endswith(('.js', '.html')):
        with request(url, headers={'Accept-Encoding': 'gzip'}) as response:
            assert response.headers.get('Content-Encoding') == 'gzip', relative
            assert gzip.decompress(response.read()) == data, 'double/truncated gzip: ' + relative
            assert 'Accept-Encoding' in response.headers.get('Vary', '')
        with request(url, headers={'Accept-Encoding': 'gzip;q=0, *;q=1'}) as response:
            assert response.headers.get('Content-Encoding') is None
            assert response.read() == data
    try:
        request(url, headers={'If-None-Match': etag})
    except urllib.error.HTTPError as error:
        assert error.code == 304, relative
    else:
        raise AssertionError('missing conditional 304: ' + relative)
    with request(url, 'HEAD', {'Accept-Encoding': 'gzip'}) as response:
        assert response.read() == b'', relative
    served.append(relative)

private = {}
for url in ['/config.yaml', '/config.local.yaml', '/.git/config', '/src/main.ts', '/README.md',
            '/server/internal/data/ai_pets.json', '/dist/main.js.map', '/art/login.svg', '/art/FONT-LICENSE.txt',
            '/update/install-ai-pets.py', '/Report/SA-1114-04/ACCEPTANCE.md']:
    try:
        status = request(url).status
    except urllib.error.HTTPError as error:
        status = error.code
    assert status == 404, (url, status)
    private[url] = status

assets = []
patches = []
for filename in ('ai-pets-v1-assets.manifest.json', 'lilith-v1-assets.manifest.json', 'lisarido-v1-assets.manifest.json'):
    patch = json.loads((ROOT / 'update' / filename).read_text())
    archive = ROOT / 'update' / patch['archive']['name']
    assert sha(archive.read_bytes()) == patch['archive']['sha256']
    patches.append(patch['archive'])
    for entry in patch['entries']:
        data = (ROOT / 'assets' / entry['path']).read_bytes()
        assert len(data) == entry['size'] and sha(data) == entry['sha256']
        with request('/assets/' + entry['path']) as response:
            assert response.read() == data
        assets.append(entry['path'])

binary = ROOT / 'bin/saserver'
data = binary.read_bytes()
assert data[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', data, 18)[0] == 62
phoff = struct.unpack_from('<Q', data, 32)[0]
phsize, phnum = struct.unpack_from('<HH', data, 54)
assert all(struct.unpack_from('<I', data, phoff + i * phsize)[0] != 3 for i in range(phnum)), 'dynamic ELF interpreter'
assert binary.stat().st_mode & 0o777 == 0o755
version = subprocess.run([str(binary), '--version'], check=True, capture_output=True, text=True).stdout.strip()
assert version == VERSION and sha(data) == (ROOT / 'bin/saserver.sha256').read_text().split()[0]
result = {'version': version, 'binary_sha256': sha(data), 'bytes': len(data), 'format': 'static ELF64 Linux AMD64',
          'mode': '0755', 'repeat_client_identical': True, 'served_embedded_files_identical': served,
          'gzip_single_decode': True, 'explicit_gzip_exclusion': True, 'conditional_GET_304': True,
          'HEAD_empty': True, 'private_urls': private, 'asset_patches': patches,
          'served_patch_assets_identical': assets}
(OUT / 'binary-http-verification.json').write_text(json.dumps(result, indent=2) + '\n')
(OUT / 'client-build-repeatability.json').write_text(json.dumps(inputs, indent=2) + '\n')
print(json.dumps({'version': version, 'binary_sha256': result['binary_sha256'], 'verified_embedded_files': len(served), 'private_404': len(private)}))
