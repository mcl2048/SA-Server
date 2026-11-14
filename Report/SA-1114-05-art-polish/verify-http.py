"""Read served bytes from the owned QA ELF; metadata/credentials stay private."""
from pathlib import Path
import hashlib,json,urllib.request
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sha=lambda data:hashlib.sha256(data).hexdigest()
meta=json.loads(Path('/tmp/sa-primal-art-runtime.json').read_text());client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
assert meta['binary_sha256']==sha((ROOT/'bin/saserver').read_bytes())
checks=[]
def check(url,path,kind):
 with client.open(f'http://127.0.0.1:{meta["port"]}'+url,timeout=20) as response:
  data=response.read();assert response.status==200
 assert data==path.read_bytes(),url
 checks.append({'url':url,'file':path.relative_to(ROOT).as_posix(),'sha256':sha(data),'kind':kind,'status':200})
check('/',ROOT/'client/index.html','embedded')
for path in sorted((ROOT/'client/dist').glob('*.js')):check('/dist/'+path.name,path,'embedded')
check('/art/login.png',ROOT/'client/art/login.png','embedded')
for e in json.loads((ROOT/'update/primal-claws-v2-assets.manifest.json').read_text())['entries']:
 check('/assets/'+e['path'],ROOT/'assets'/e['path'],'primal-claws-v2')
result={'binary_sha256':meta['binary_sha256'],'all_bytes_match':True,'checks':checks}
(OUT/'live-assets.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'embedded_files':sum(c['kind']=='embedded' for c in checks),'final_patch_files':sum(c['kind']=='primal-claws-v2' for c in checks),'binary_sha256':meta['binary_sha256']}))
