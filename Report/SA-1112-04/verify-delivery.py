"""Verify the actual release binary's embedded client and publication boundary."""
from pathlib import Path
import argparse, hashlib, json, struct, subprocess, urllib.error, urllib.request

root=Path(__file__).resolve().parents[2]
report=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--base',required=True)
a=parser.parse_args()
base=a.base.rstrip('/')
def sha(data):return hashlib.sha256(data).hexdigest()
files=[root/'client/index.html',*sorted((root/'client/dist').glob('*.js')),root/'client/art/login.png']
before={str(p.relative_to(root)):sha(p.read_bytes()) for p in files}
subprocess.run(['node','client/build.mjs'],cwd=root,check=True,capture_output=True)
assert before=={str(p.relative_to(root)):sha(p.read_bytes()) for p in files},'Client repeat build changed bytes'
(report/'client-build-repeatability.json').write_text(json.dumps({'identical_repeat_build':True,'files':before},indent=2)+'\n')
matches=[];cache={}
for p in files:
 rel=p.relative_to(root/'client');url='/' if str(rel)=='index.html' else '/'+str(rel)
 with urllib.request.urlopen(base+url) as r:
  assert r.read()==p.read_bytes(),str(rel)
  assert r.headers['X-Content-Type-Options']=='nosniff'
  etag=r.headers.get('ETag');assert etag
  if str(rel)=='art/login.png':
   assert r.headers.get_content_type()=='image/png'
   assert r.headers.get('Cache-Control')=='no-cache'
  cache[str(rel)]={'etag':etag,'sha256':sha(p.read_bytes())}
 try:urllib.request.urlopen(urllib.request.Request(base+url,headers={'If-None-Match':etag}))
 except urllib.error.HTTPError as e:assert e.code==304
 else:raise AssertionError('conditional GET should return 304: '+url)
 with urllib.request.urlopen(urllib.request.Request(base+url,method='HEAD',headers={'Accept-Encoding':'gzip'})) as r:
  assert r.read()==b''
  if str(rel)=='art/login.png':assert r.headers.get('Content-Encoding') is None
 matches.append(str(rel))
private={}
for url in ['/src/main.ts','/config.yaml','/config.local.yaml','/.git/config','/dist/main.js.map','/art/login.svg','/art/FONT-LICENSE.txt','/Report/SA-1112-04/SESSION-REVIEW.md','/art/../config.yaml']:
 try:status=urllib.request.urlopen(base+url).status
 except urllib.error.HTTPError as e:status=e.code
 assert status==404,(url,status);private[url]=status
binary=root/'bin/saserver';data=binary.read_bytes()
assert data[:4]==b'\x7fELF' and data[4:6]==bytes([2,1]) and struct.unpack_from('<H',data,18)[0]==62
phoff=struct.unpack_from('<Q',data,32)[0];phsize,phnum=struct.unpack_from('<HH',data,54)
assert all(struct.unpack_from('<I',data,phoff+i*phsize)[0]!=3 for i in range(phnum)), 'Unexpected dynamic interpreter'
version=subprocess.run([str(binary),'--version'],capture_output=True,text=True,check=True).stdout.strip()
assert version=='v0.2.7-LYNX';assert binary.stat().st_mode&0o777==0o755
expected=(root/'bin/saserver.sha256').read_text().split()[0];assert sha(data)==expected
result={'version':version,'sha256':sha(data),'bytes':len(data),'mode':'0755','format':'static ELF64 Linux AMD64','served_files_identical':matches,'cache':cache,'private_urls':private,'conditional_GET_304':True,'HEAD_empty':True,'PNG_not_gzipped':True}
(report/'binary-http-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='cache'},indent=2))
