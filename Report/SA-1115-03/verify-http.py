"""Verify the delivered ELF's real HTTP bytes in an owned, isolated runtime.

No account or production database is opened. Runtime paths/logs remain private.
"""
from pathlib import Path
import concurrent.futures
import gzip
import hashlib
import json
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()


def main():
    binary = ROOT / 'bin/saserver'
    result = {'binary_sha256': sha(binary.read_bytes()), 'files': [], 'checks': []}
    with tempfile.TemporaryDirectory(prefix='sa-1115-03-http-') as temp:
        work = Path(temp)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        config = {
            'addr': f'127.0.0.1:{port}', 'data': str(ROOT / 'gamedata'),
            'assets': str(ROOT / 'assets'), 'db': str(work / 'fixture.db'),
            'client': 'embedded', 'log': 'error',
            'groups': [{'name': 'ReleaseCheck', 'lines': ['Isolated']}],
        }
        # JSON is a YAML subset; this avoids a third-party dependency.
        (work / 'config.yaml').write_text(json.dumps(config))
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        base = f'http://127.0.0.1:{port}'

        def request(path, headers=None, method='GET'):
            req = urllib.request.Request(base + path, headers=headers or {}, method=method)
            try:
                response = opener.open(req, timeout=10)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return response.status, response.headers, response.read()

        with (work / 'runtime.log').open('wb') as log:
            process = subprocess.Popen([str(binary)], cwd=work, stdout=log, stderr=log)
            try:
                ready = False
                for _ in range(200):
                    if process.poll() is not None:
                        raise RuntimeError('owned ELF exited before HTTP became ready')
                    try:
                        if request('/')[0] == 200:
                            ready = True
                            break
                    except OSError:
                        pass
                    time.sleep(0.1)
                assert ready, 'HTTP startup timed out'
                inputs = [
                    ('/' + p.relative_to(ROOT / 'server/webclient/static').as_posix(), p)
                    for p in sorted((ROOT / 'server/webclient/static').rglob('*'))
                    if p.is_file() and p.name != 'README.txt'
                ]
                for name in ('ai-pets-v1', 'lilith-v2', 'lisarido-v3', 'primal-claws-v3'):
                    manifest = json.loads((ROOT / 'update' / f'{name}-assets.manifest.json').read_text())
                    for entry in manifest['entries']:
                        p = ROOT / 'assets' / entry['path']
                        assert sha(p.read_bytes()) == entry['sha256'], str(p)
                        inputs.append(('/assets/' + entry['path'], p))

                def verify(item):
                    url, path = item
                    status, headers, body = request(url, {'Accept-Encoding': 'gzip'})
                    assert status == 200, (url, status)
                    if headers.get('Content-Encoding') == 'gzip':
                        body = gzip.decompress(body)
                    assert body == path.read_bytes(), url
                    return {'url': url, 'bytes': len(body), 'sha256': sha(body)}

                with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                    result['files'] = list(pool.map(verify, inputs))
                for url in ('/dist/main.js', '/art/login.png'):
                    status, headers, body = request(url)
                    assert status == 200 and headers.get('ETag') and headers.get('X-Content-Type-Options') == 'nosniff'
                    code, _, head = request(url, method='HEAD')
                    assert code == 200 and head == b'', url
                    code, _, conditional = request(url, {'If-None-Match': headers['ETag']})
                    assert code == 304 and conditional == b'', url
                    result['checks'].append({'path': url, 'head': 200, 'conditional': 304})
                for url in ('/config.yaml', '/config.local.yaml', '/src/main.ts', '/dist/main.js.map', '/art/login.svg', '/assets/../config.yaml'):
                    status, _, _ = request(url)
                    assert status == 404, (url, status)
                    result['checks'].append({'path': url, 'private_status': status})
            finally:
                if process.poll() is None:
                    process.send_signal(signal.SIGTERM)
                try:
                    code = process.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    raise AssertionError('owned runtime failed graceful SIGTERM')
                result['shutdown'] = {'exit_code': code, 'signal': 'SIGTERM', 'owned_isolated_runtime': True}
                assert code == 0, code
    result.update(success=True, matched=len(result['files']))
    (OUT / 'http-content.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f"Matched {result['matched']} real HTTP files; HEAD/304/private routes and SIGTERM passed")


if __name__ == '__main__':
    main()
