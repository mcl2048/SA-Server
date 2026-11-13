"""Verify the actual v0.2.10 process serves the matched embedded client and pet pack."""
from pathlib import Path
import argparse, hashlib, json, struct, subprocess, urllib.error, urllib.request

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--base',required=True);args=p.parse_args()
BASE=args.base.rstrip('/')
def digest(data):return hashlib.sha256(data).hexdigest()
def fetch(path,method='GET',headers=None):return urllib.request.urlopen(urllib.request.Request(BASE+path,method=method,headers=headers or {}))
files=[ROOT/'client/index.html',*sorted((ROOT/'client/dist').glob('*.js')),ROOT/'client/art/login.png']
before={str(p.relative_to(ROOT)):digest(p.read_bytes()) for p in files}
subprocess.run(['node','client/build.mjs'],cwd=ROOT,capture_output=True,check=True)
assert before=={str(p.relative_to(ROOT)):digest(p.read_bytes()) for p in files}
served=[]
for path in files:
 rel=path.relative_to(ROOT/'client').as_posix();url='/' if rel=='index.html' else '/'+rel
 with fetch(url) as r:
  assert r.read()==path.read_bytes(),rel
  assert r.headers.get('X-Content-Type-Options')=='nosniff'
  etag=r.headers.get('ETag');assert etag
  if rel.endswith('.png'):assert r.headers.get_content_type()=='image/png' and r.headers.get('Cache-Control')=='no-cache'
 try:fetch(url,headers={'If-None-Match':etag})
 except urllib.error.HTTPError as e:assert e.code==304
 else:raise AssertionError('Missing conditional 304: '+url)
 with fetch(url,'HEAD',{'Accept-Encoding':'gzip'}) as r:assert r.read()==b''
 served.append(rel)
private={}
for url in ['/config.yaml','/config.local.yaml','/.git/config','/src/main.ts','/server/internal/data/ai_pets.json','/dist/main.js.map','/art/login.svg','/art/FONT-LICENSE.txt','/update/install-ai-pets.py','/Report/SA-1113-03/ACCEPTANCE.md']:
 try:status=fetch(url).status
 except urllib.error.HTTPError as e:status=e.code
 assert status==404,(url,status);private[url]=status
package=json.loads((ROOT/'update/ai-pets-v1-assets.manifest.json').read_text())
archive=ROOT/'update'/package['archive']['name'];assert digest(archive.read_bytes())==package['archive']['sha256'] and archive.stat().st_size==package['archive']['size']
packserved=[]
for entry in package['entries']:
 path=ROOT/'assets'/entry['path'];data=path.read_bytes()
 assert len(data)==entry['size'] and digest(data)==entry['sha256']
 with fetch('/assets/'+entry['path']) as r:assert r.read()==data
 packserved.append(entry['path'])
binary=ROOT/'bin/saserver';data=binary.read_bytes()
assert data[:4]==b'\x7fELF' and data[4:6]==bytes([2,1]) and struct.unpack_from('<H',data,18)[0]==62
phoff=struct.unpack_from('<Q',data,32)[0];phsize,phnum=struct.unpack_from('<HH',data,54)
assert all(struct.unpack_from('<I',data,phoff+i*phsize)[0]!=3 for i in range(phnum))
assert binary.stat().st_mode&0o777==0o755
version=subprocess.run([str(binary),'--version'],capture_output=True,text=True,check=True).stdout.strip();assert version=='v0.2.10-LYNX'
assert digest(data)==(ROOT/'bin/saserver.sha256').read_text().split()[0]
result={'version':version,'sha256':digest(data),'bytes':len(data),'format':'static ELF64 Linux AMD64','mode':'0755','repeat_client_identical':True,'served_embedded_files_identical':served,'conditional_GET_304':True,'HEAD_empty':True,'private_urls':private,'archive':package['archive'],'served_incremental_files_identical':packserved}
(OUT/'binary-http-verification.json').write_text(json.dumps(result,indent=2)+'\n')
(OUT/'client-build-repeatability.json').write_text(json.dumps(before,indent=2)+'\n')
print(json.dumps(result,indent=2))
