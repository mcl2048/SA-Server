"""Compare release-served client and all new pet files with installed bytes."""
from pathlib import Path
import argparse,hashlib,json,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--meta',required=True);args=parser.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest();meta=json.loads(Path(args.meta).read_text());client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
assert meta['binary_sha256']==sha((ROOT/'bin/saserver').read_bytes());checks=[]
def check(url,path,kind):
 with client.open(f'http://127.0.0.1:{meta["port"]}'+url,timeout=20) as response:
  data=response.read();assert response.status==200
 assert data==path.read_bytes(),url
 checks.append({'url':url,'sha256':sha(data),'kind':kind,'status':200})
check('/',ROOT/'client/index.html','embedded')
for p in sorted((ROOT/'client/dist').glob('*.js')):check('/dist/'+p.name,p,'embedded')
check('/art/login.png',ROOT/'client/art/login.png','embedded')
for pack in ('primal-claws-v3','lilith-v2','lisarido-v2'):
 for e in json.loads((ROOT/f'update/{pack}-assets.manifest.json').read_text())['entries']:check('/assets/'+e['path'],ROOT/'assets'/e['path'],pack)
retired=[]
for pack in ('primal-claws-v1','primal-claws-v2','lilith-v1','lisarido-v1'):
 try:client.open(f'http://127.0.0.1:{meta["port"]}/assets/extensions/{pack}/manifest.json',timeout=10)
 except urllib.error.HTTPError as error:assert error.code==404;retired.append(pack)
 else:raise AssertionError('old pack still served: '+pack)
result={'binary_sha256':meta['binary_sha256'],'all_bytes_match':True,'retired_packs_not_served':retired,'checks':checks}
(OUT/'live-assets.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'passed':True,'embedded_files':sum(c['kind']=='embedded' for c in checks),'new_asset_files':sum(c['kind']!='embedded' for c in checks),'retired':len(retired)}))
