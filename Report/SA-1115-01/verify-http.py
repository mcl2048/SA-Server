"""Read-only byte verification against the owned final runtime, never auth data."""
from pathlib import Path
import concurrent.futures, gzip, hashlib, json, sys, urllib.request
ROOT=Path(__file__).resolve().parents[2]
meta=json.loads(Path(sys.argv[1]).read_text());base=f"http://127.0.0.1:{meta['port']}"
inputs=[(p.relative_to(ROOT/'server/webclient/static').as_posix(),p) for p in (ROOT/'server/webclient/static').rglob('*') if p.is_file() and p.name!='README.txt']
manifest=json.loads((ROOT/'update/lisarido-v3-assets.manifest.json').read_text())
inputs += [('assets/'+e['path'],ROOT/'assets'/e['path']) for e in manifest['entries']]
def verify(pair):
 url,path=pair
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 with opener.open(urllib.request.Request(base+'/'+url,headers={'Accept-Encoding':'gzip'}),timeout=20) as response:
  body=response.read();body=gzip.decompress(body) if response.headers.get('Content-Encoding')=='gzip' else body
  assert body==path.read_bytes(),url
  return {'url':url,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(verify,inputs))
output={'binary_sha256':hashlib.sha256((ROOT/'bin/saserver').read_bytes()).hexdigest(),'matched':len(results),'files':results}
(ROOT/'Report/SA-1115-01/http-content.json').write_text(json.dumps(output,indent=2)+'\n');print('Matched',len(results),'embedded client and final Lisarido asset files')
