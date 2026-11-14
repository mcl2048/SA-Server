"""Independent final evidence and public archive consistency gate."""
from pathlib import Path,PurePosixPath
import hashlib,json,re,subprocess,zipfile,tarfile,io
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent;VERSION='v0.2.17-LYNX'
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads((OUT/p).read_text())
def main():
 binary=ROOT/'bin/saserver';digest=sha(binary.read_bytes());assert subprocess.check_output([str(binary),'--version'],text=True).strip()==VERSION
 assert (ROOT/'bin/saserver.sha256').read_text().split()[0]==digest
 frozen=read('source-inputs.json');assert all(sha((ROOT/p).read_bytes())==s for p,s in frozen.items())
 repeat=read('build-repeatability.json');assert repeat['before_sha256']==repeat['after_sha256']==digest and repeat['exit_code']==0
 tests=(OUT/'all-client-tests.txt').read_text();assert 'ℹ tests 224' in tests and 'ℹ pass 224' in tests and 'ℹ fail 0' in tests
 assert read('installer-green.json')['passed']==31
 browsers={};count=0
 for name,expected in [('final-art',16),('final-mobile-regression',14)]:
  b=read('browser/'+name+'.json');assert not b.get('failure') and not b['errors'],name
  assert b['binary_sha256']==digest and b['binary_version']==VERSION
  assert len(b['checks'])==expected and all(c['passed'] for c in b['checks'])
  assert b['shutdown']['exit_code']==0 and not b['shutdown']['timed_out'] and b['shutdown']['position_matches']
  browsers[name]={'checks':expected,'errors':0,'shutdown_exit_code':0,'position_matches':True};count+=expected
 b=read('browser/final-art.json');assert len(b['art'])==4
 assert {(a['device'],a['pet']) for a in b['art']}=={(d,p) for d in ('desktop','mobile') for p in ('cyrufas','claudes')}
 for c in b['checks']:
  e=c['evidence']
  if 'comparison' in e:
   name='cyrufas' if 'cyrufas' in c['case'] else 'claudes';sprite=199400 if name=='cyrufas' else 199401
   direction=7 if 'dir7' in c['case'] else 3
   assert any(f['sprite']==sprite and f['dir']==direction and f['quad'] for f in e['comparison']['fighters'])
  if 'actual combat visibility' in c['case']:assert e['actor']['quad']['visible']>=.95
  for file in ([e['screenshot']] if 'screenshot' in e else e.get('screenshots',[])):
   assert Path(file).name==file and (OUT/'browser'/file).is_file()
 http=read('live-assets.json');assert http['binary_sha256']==digest and http['all_bytes_match']
 assert len(http['checks'])==59 and sum(c['kind']=='embedded' for c in http['checks'])==52
 art=read('art-validation.json');assert art['character_frames']==752 and art['effect_frames']==24 and art['all_128_actions_animated'] and not art['clipped_frames']
 assert all(abs(p['scale_x_over_y']-1)<.015 and abs(p['support_y_world']-12)<1 for p in read('proportions.json'))
 m=json.loads((ROOT/'update/primal-claws-v2-assets.manifest.json').read_text());assert m['packageId']=='primal-claws-v2' and len(m['entries'])==7
 assert sha((ROOT/'update'/m['archive']['name']).read_bytes())==m['archive']['sha256']
 for e in m['entries']:assert sha((ROOT/'assets'/e['path']).read_bytes())==e['sha256']
 g=read('art-generation.json');assert g['generator_sha256']==sha((ROOT/'scripts/generate-primal-claws.py').read_bytes())
 package=ROOT/f'bin/saserver-{VERSION}-linux-amd64.zip';prefix=f'saserver-{VERSION}/';patches=[]
 with zipfile.ZipFile(package) as z:
  assert z.testzip() is None
  for i in z.infolist():
   assert i.filename.startswith(prefix);rel=i.filename[len(prefix):];p=PurePosixPath(rel)
   assert not p.is_absolute() and '..' not in p.parts and not {'assets','Assets'}&set(p.parts)
   assert not rel.endswith(('.db','.sqlite','.db-wal','.db-shm')) and 'credentials' not in rel and 'config.local' not in rel
   assert z.read(i)==(ROOT/rel).read_bytes(),rel
   if rel.endswith('-assets.tar.gz'):
    with tarfile.open(fileobj=io.BytesIO(z.read(i)),mode='r:gz') as t:
     members=t.getmembers();assert all(a.isfile() and a.name.startswith('extensions/') for a in members)
     patches.append({'archive':rel,'files':len(members)})
  assert z.read(prefix+'bin/saserver')==binary.read_bytes()
  assert z.getinfo(prefix+'bin/saserver').external_attr>>16&0o777==0o755
  entries=len(z.infolist())
 assert len(patches)==4 and sum(p['files'] for p in patches)==26
 for p in ('bin/saserver-v0.2.16-LYNX-linux-amd64.zip','bin/saserver-v0.2.16-LYNX-linux-amd64.zip.sha256'):assert not (ROOT/p).exists()
 archive_sha=sha(package.read_bytes());assert (ROOT/(str(package.relative_to(ROOT))+'.sha256')).read_text().split()[0]==archive_sha
 r={'version':VERSION,'baseline_commit':'e5aa5d331ac5f50981948206a9d93917a8b49d7b','binary':{'path':'bin/saserver','bytes':binary.stat().st_size,'sha256':digest,'format':read('elf.json')},'archive':{'path':package.relative_to(ROOT).as_posix(),'bytes':package.stat().st_size,'sha256':archive_sha,'files':entries,'all_entries_match_current_public_files':True,'patches':patches},'checks':{'client_and_builder':224,'installers':31,'browser_checks':count,'browsers':browsers,'frozen_source_inputs':len(frozen),'embedded_http_files':52,'final_patch_http_files':7,'repeat_binary_identical':True},'art':{'character_frames':752,'effect_frames':24,'actions':128,'uniform_source_aspect_all_16_views':True,'clipped_frames':0,'patch_sha256':m['archive']['sha256']},'prompt_sha256':sha((ROOT/'Prompt/Task-Now.txt').read_bytes()),'scope':'Real Linux AMD64 ELF, native UI/GM, original assets, Chromium with SwiftShader, viewport/touch emulation. No physical Android/iOS/Safari certification; visual quality reviewed separately.'}
 (OUT/'release.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':True,'browser_checks':count,'binary_sha256':digest,'archive_sha256':archive_sha}))
if __name__=='__main__':main()
