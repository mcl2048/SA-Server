"""Final source, art, real-browser and ZIP gate for v0.2.18-LYNX."""
from pathlib import Path,PurePosixPath
import hashlib,json,subprocess,zipfile,tarfile,io,struct
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent;VERSION='v0.2.18-LYNX'
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads((OUT/p).read_text())
def main():
 binary=ROOT/'bin/saserver';digest=sha(binary.read_bytes());assert subprocess.check_output([str(binary),'--version'],text=True).strip()==VERSION
 assert (ROOT/'bin/saserver.sha256').read_text().split()[0]==digest
 data=binary.read_bytes();assert data[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',data,18)[0]==62
 phoff=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54);assert all(struct.unpack_from('<I',data,phoff+i*size)[0]!=3 for i in range(count))
 frozen=read('source-inputs.json');assert all(sha((ROOT/p).read_bytes())==s for p,s in frozen.items())
 repeat=read('build-repeatability.json');assert repeat['before_sha256']==repeat['after_sha256']==digest and repeat['exit_code']==0
 for p in ('validation-status.json','v3-final-status.json','final-browser-status.json'):assert all(s['exit']==0 for s in read(p)),p
 tests=(OUT/'client-tests.txt').read_text();assert 'ℹ tests 224' in tests and 'ℹ pass 224' in tests and 'ℹ fail 0' in tests
 assert json.loads((OUT/'installer-final.txt').read_text())['passed']==44
 shadow=ROOT/'Report/SA-1114-05-shadow-design';assert all(json.loads((shadow/(n+'-installer-green.json')).read_text())['passed']==41 for n in ('lilith','lisarido'))
 browsers={};total=0
 for name,expected in [('final-art',25),('final-mobile-regression',14)]:
  b=read('browser/'+name+'.json');assert not b.get('failure') and not b['errors'],(name,b.get('failure'),b['errors'])
  assert b['binary_sha256']==digest and b['binary_version']==VERSION
  assert len(b['checks'])==expected and all(c['passed'] for c in b['checks'])
  assert b['shutdown']['exit_code']==0 and not b['shutdown']['timed_out'] and b['shutdown']['position_matches']
  for c in b['checks']:
   e=c.get('evidence',{})
   for file in ([e['screenshot']] if 'screenshot' in e else e.get('screenshots',[])):
    assert Path(file).name==file and (OUT/'browser'/file).is_file()
  browsers[name]={'checks':expected,'errors':0,'saved_position_matches':True};total+=expected
 http=read('live-assets.json');assert http['binary_sha256']==digest and http['all_bytes_match'] and len(http['checks'])==69 and len(http['retired_packs_not_served'])==4
 art=read('art-validation.json');assert art['character_frames']==752 and art['effect_frames']==24 and art['floor_shadow_checked_every_character_frame'] and not art['clipped_frames']
 assert read('angle-inspection.json')['v3_all_aspect_errors_below_1_5_percent'];assert read('real-upgrade.json')['passed']
 g=read('art-generation.json');assert g['generator_sha256']==sha((ROOT/'scripts/generate-primal-claws.py').read_bytes())
 gait=ROOT/'Report/SA-1114-05-gait-review'
 assert json.loads((gait/'production-input.json').read_text())['generator_sha256']==g['generator_sha256']
 assert 'Ran 4 tests' in (gait/'limb-ownership-green.txt').read_text() and (gait/'limb-ownership-green.txt').read_text().strip().endswith('OK')
 patches=[]
 for pack in ('primal-claws-v3','lilith-v2','lisarido-v2'):
  m=json.loads((ROOT/f'update/{pack}-assets.manifest.json').read_text());assert m['packageId']==pack
  assert sha((ROOT/'update'/m['archive']['name']).read_bytes())==m['archive']['sha256']
  assert all(sha((ROOT/'assets'/e['path']).read_bytes())==e['sha256'] for e in m['entries'])
  patches.append({'id':pack,'files':len(m['entries']),**m['archive']})
 for old in ('primal-claws-v1','primal-claws-v2','lilith-v1','lisarido-v1'):assert not (ROOT/'assets/extensions'/old).exists()
 # Frame/timing compatibility is checked independently of atlas packing.
 pack=ROOT/'assets/extensions/primal-claws-v3'
 with tarfile.open(ROOT/'update/primal-claws-v2-assets.tar.gz','r:gz') as old:
  for sprite in (199400,199401,199402):
   previous=json.loads(old.extractfile(f'extensions/primal-claws-v2/anim/{sprite}.json').read());current=json.loads((pack/f'anim/{sprite}.json').read_text());assert previous['actions']==current['actions']
  assert old.extractfile('extensions/primal-claws-v2/pages/00002.png').read()==(pack/'pages/00002.png').read_bytes()
 archive=ROOT/f'bin/saserver-{VERSION}-linux-amd64.zip';prefix=f'saserver-{VERSION}/';assets_in_zip=[]
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None
  for i in z.infolist():
   assert i.filename.startswith(prefix);rel=i.filename[len(prefix):];p=PurePosixPath(rel)
   assert not p.is_absolute() and '..' not in p.parts and not {'assets','Assets'}&set(p.parts)
   assert not rel.endswith(('.db','.sqlite','.db-wal','.db-shm')) and 'credentials' not in rel and 'config.local' not in rel
   assert z.read(i)==(ROOT/rel).read_bytes(),rel
   if rel.endswith('-assets.tar.gz'):
    with tarfile.open(fileobj=io.BytesIO(z.read(i)),mode='r:gz') as tar:
     members=tar.getmembers();assert all(a.isfile() and a.name.startswith('extensions/') for a in members);assets_in_zip.append({'name':rel,'files':len(members)})
  assert z.read(prefix+'bin/saserver')==binary.read_bytes();assert z.getinfo(prefix+'bin/saserver').external_attr>>16&0o777==0o755
  for old in ('primal-claws-v1','primal-claws-v2','lilith-v1','lisarido-v1'):assert prefix+f'update/{old}-assets.manifest.json' in z.namelist()
  for p in (ROOT/'docs/skills/stoneage').rglob('*'):
   if p.is_file():assert prefix+p.relative_to(ROOT).as_posix() in z.namelist()
  entries=len(z.infolist())
 assert len(assets_in_zip)==4 and sum(p['files'] for p in assets_in_zip)==26
 assert not (ROOT/'bin/saserver-v0.2.17-LYNX-linux-amd64.zip').exists()
 archive_sha=sha(archive.read_bytes());assert (ROOT/(str(archive.relative_to(ROOT))+'.sha256')).read_text().split()[0]==archive_sha
 skill=ROOT/'docs/skills/stoneage';assert (skill/'SKILL.md').read_bytes()==Path('/home/coder/.codex/skills/stoneage/SKILL.md').read_bytes()
 result={'version':VERSION,'baseline':'cc6243e3a5c66557cdea8ff97f7ec6ad1c45279b','binary':{'path':'bin/saserver','bytes':len(data),'sha256':digest,'format':'static ELF64 Linux AMD64'},'archive':{'path':str(archive.relative_to(ROOT)),'files':entries,'bytes':archive.stat().st_size,'sha256':archive_sha},'patches':patches,'checks':{'client_and_builder':224,'installers':126,'browser_checks':total,'browsers':browsers,'http_files':69,'old_packs_http_404':4,'source_inputs':len(frozen),'repeat_binary_identical':True},'art':{'character_frames':1192,'effect_frames':76,'actions':256,'source_aspect_all_16_primal_views':True,'all_new_frames_no_clipping':True,'body_height_calibration':{'cyrufas':84,'claudes':88}},'scope':'actual Linux release, native UI/GM, original resources and Chromium SwiftShader; mobile viewport/touch emulation, no physical Android/iOS/Safari certification; no production restart'}
 (OUT/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':True,'browser_checks':total,'binary_sha256':digest,'archive_sha256':archive_sha}))
if __name__=='__main__':main()
