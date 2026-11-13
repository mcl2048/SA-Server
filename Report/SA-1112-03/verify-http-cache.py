"""Verify actual release wire responses: decoded validators, negotiation and HEAD/304."""
from pathlib import Path
import json,http.client,gzip
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent
meta=json.loads(Path('/tmp/sa-layout-runtime.json').read_text())
def get(path,method='GET',**headers):
    conn=http.client.HTTPConnection('127.0.0.1',meta['port'],timeout=10)
    conn.request(method,path,headers=headers);response=conn.getresponse();data=response.read();result=(response.status,dict((k.lower(),v) for k,v in response.getheaders()),data);conn.close();return result
files=sorted((root/'client/dist').glob('*.js'));checks=[];bytes_first=0
for file in files:
    path='/dist/'+file.name
    status,head,data=get(path);assert status==200 and data==file.read_bytes()
    etag=head['etag'];assert etag.startswith('W/') and head['cache-control']=='no-cache';bytes_first+=len(data)
    for encoding in ('identity','gzip','gzip;q=0'):
        status,headers,body=get(path,**{'Accept-Encoding':encoding,'If-None-Match':etag})
        assert status==304 and not body and 'content-encoding' not in headers
        assert 'Accept-Encoding' in headers['vary']
    checks.append(file.name)
path='/dist/main.js'
for method in ('GET','HEAD'):
    for encoding,compressed in (('gzip',True),('gzip;q=0',False),('br, gzip;q=0, identity;q=1',False),('GZip',True),('*;q=1, gzip;q=0',False)):
        status,headers,body=get(path,method,**{'Accept-Encoding':encoding});assert status==200
        assert (headers.get('content-encoding')=='gzip')==compressed
        assert 'Accept-Encoding' in headers['vary']
        if method=='HEAD':assert not body
        else:assert (gzip.decompress(body) if compressed else body)==(root/'client/dist/main.js').read_bytes()
result={'binary_sha256':meta['sha256'],'modules_revalidate_with_304':checks,'first_identity_bytes':bytes_first,'conditional_module_body_bytes':0,'conditional_variants':['identity','gzip','gzip;q=0'],'gzip_negotiation_GET_HEAD_pass':True,'network_responses':True}
(out/'http-cache-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
