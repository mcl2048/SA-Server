"""Verify running embedded binary, client build repeatability and final source hashes."""
from pathlib import Path
import json, urllib.request, urllib.error, hashlib, subprocess
root=Path(__file__).resolve().parents[2];report=root/'Report/SA-1112-02'
meta=json.loads(Path('/tmp/sa-release-final-runtime.json').read_text());base=f'http://127.0.0.1:{meta["port"]}'
files=[root/'client/index.html',*sorted((root/'client/dist').glob('*.js'))];matches=[]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
before={str(p.relative_to(root)):digest(p) for p in files}
subprocess.run(['node','client/build.mjs'],cwd=root,check=True,capture_output=True)
assert before=={str(p.relative_to(root)):digest(p) for p in files},'Client rebuild changed bytes'
(report/'client-build-repeatability.json').write_text(json.dumps({'identical_repeat_build':True,'files':before},indent=2)+'\n')
for p in files:
    rel=p.relative_to(root/'client');url='/' if str(rel)=='index.html' else '/'+str(rel)
    with urllib.request.urlopen(base+url) as response:
        assert response.read()==p.read_bytes(),str(rel)
        assert response.headers['X-Content-Type-Options']=='nosniff'
    matches.append(str(rel))
checks={}
for path in ('/src/main.ts','/config.yaml','/dist/main.js.map','/.git/config','/dist/../src/main.ts','/README.txt'):
    try:code=urllib.request.urlopen(base+path).status
    except urllib.error.HTTPError as error:code=error.code
    assert code==404,(path,code);checks[path]=code
for path in ('/','/dist/main.js'):
    with urllib.request.urlopen(urllib.request.Request(base+path,method='HEAD',headers={'Accept-Encoding':'gzip'})) as response:assert not response.read()
binary=root/'bin/saserver';sha=digest(binary);assert sha==meta['sha256'];assert binary.stat().st_mode&0o777==0o755
version=subprocess.run([str(binary),'--version'],capture_output=True,text=True,check=True).stdout.strip();assert version=='v0.2.5-LYNX'
result={'sha256':sha,'bytes':binary.stat().st_size,'version':version,'mode':'0755','served_files_identical':matches,'private_urls':checks,'gzip_HEAD_body_empty':True,'only_embedded_client_in_runtime':not (Path(meta['dir'])/'client').exists()}
(report/'binary-http-verification.json').write_text(json.dumps(result,indent=2)+'\n')
inputs=[]
for basepath in ('client/src','server','proto','scripts'):
    inputs += [p for p in (root/basepath).rglob('*') if p.is_file() and 'webclient/static' not in p.as_posix()]
inputs += [root/'client/build.mjs',root/'client/index.html',root/'bin/saserver']
(report/'FINAL-INPUTS.json').write_text(json.dumps({str(p.relative_to(root)):digest(p) for p in sorted(inputs)},indent=2)+'\n')
print(json.dumps(result,indent=2))
