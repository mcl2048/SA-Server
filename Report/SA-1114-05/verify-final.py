"""Accept the release only after independent final-ELF and frozen-input checks."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent;VERSION='v0.2.16-LYNX'
read=lambda name:json.loads((OUT/name).read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
digest=sha(ROOT/'bin/saserver');prompt_digest=sha(ROOT/'Prompt/Task-Now.txt')
assert (OUT/'prompt-delivered.sha256').read_text().split()[0]==prompt_digest
assert subprocess.check_output([str(ROOT/'bin/saserver'),'--version'],text=True).strip()==VERSION
checks=read('checks-status.json');assert checks['state']=='finished' and checks['success'] and all(c['exit_code']==0 for c in checks['checks'])
for name in ('server-package-tests','server-race','http','repeat-build','art-repeatability','package','primal-browser','mobile-regression'):
 s=read(name+'-status.json');assert s['state']=='finished' and s['exit_code']==0,(name,s)
t=(OUT/'client-tests.txt').read_text();total,passed=(int(re.search(p,t)[1]) for p in (r'ℹ tests (\d+)',r'ℹ pass (\d+)'));assert total==passed and 'ℹ fail 0' in t
browser_count=0
for name,expected in (('final-primal.json',20),('final-mobile-regression.json',14)):
 b=read('browser/'+name);assert b['binary_sha256']==digest and b['binary_version']==VERSION
 assert not b.get('failure') and not b['errors'];assert len(b['checks'])==expected and all(c['passed'] for c in b['checks'])
 assert b['shutdown']['exit_code']==0 and not b['shutdown']['timed_out'] and b['shutdown']['position_matches'];browser_count+=len(b['checks'])
b=read('browser/final-primal.json');assert len(b['primal'])==4 and {(p['device'],p['pet']) for p in b['primal']}=={(d,p) for d in ('desktop','mobile') for p in ('cyrufas','claudes')}
for p in b['primal']:
 assert p['adult']['skills'] and [s['id'] for s in p['adult']['skills']]==[1,2]
 events=[e for turn in p['cross']['events'] for e in turn['events']];hits=[e for e in events if e['effect']==199402 and e['kind']=='attack']
 assert [e['target'] for e in hits]==[16,15,17,11]
 assert any(e['kind']=='heal' and e['damage']>0 for e in events), 'actual self-healing evidence absent'
 # Submitted native quads can lie outside a cropped mobile viewport. Require
 # the recorded CSS projection and a matching screenshot, not just draw calls.
 if p['device']=='mobile':
  visible=p['visibility'];assert visible['camera']=={'preference':'follow','control':'camera-follow','input':'native tap'}
  for kind in ('attack','cross'):
   v=visible[kind];assert v['viewport']=={'width':390,'height':844}
   assert v['thresholds']=={'actorVisibleRatio':.8,'actorCenterVisible':True,'redEffectVisibleRatio':.35}
   assert v['actorEvidence'], (p['pet'],kind,'missing visible strike screenshot')
   for e in v['actorEvidence']:
    assert e['index'] in (5,6,7) and e['screen']['visibleRatio']>=.8 and e['screen']['centerVisible']
    assert Path(e['screenshot']).name==e['screenshot'] and (OUT/'browser'/e['screenshot']).is_file()
  v=visible['cross'];assert len(set(v['visibleRedFrames']))>=2 and v['redEffectEvidence']
  for e in v['redEffectEvidence']:
   assert e['screen']['visibleRatio']>=.35
   assert Path(e['screenshot']).name==e['screenshot'] and (OUT/'browser'/e['screenshot']).is_file()
# The original mobile Cyrufas effect screenshot arrived late. Its replacement
# is an explicitly separate native cast; preserve the original business run.
s=read('red-probe-status.json');assert s['state']=='finished' and s['exit_code']==0
probe=read('browser/final-primal-red-probe.json');assert probe['binary_sha256']==digest and probe['binary_version']==VERSION
assert not probe.get('failure') and not probe['errors'] and len(probe['checks'])==1 and probe['checks'][0]['passed']
assert probe['shutdown']['exit_code']==0 and probe['shutdown']['position_matches'] and not probe['shutdown']['timed_out']
red=probe['redProbe'];assert red['device']=='mobile' and red['pet']=='cyrufas' and red['threshold']==.35
assert red['viewport']=={'width':390,'height':844} and len(set(red['visibleRedFrames']))>=2
assert red['command']=={'skillId':29060,'skillSlot':2,'target':16}
assert any(q['skill']==2 and q['target']==16 for q in red['requests'])
assert [e['target'] for t in red['events'] for e in t['events'] if e['kind']=='attack' and e['effect']==199402]==[16,15,17,11]
accepted={c['screenshot']:c for c in red['captures'] if c.get('visualAccepted')}
assert accepted and sorted(accepted)==red['visualReview']['acceptedScreenshots']
for name,c in accepted.items():
 assert c['method']=='CDP Page.captureScreenshot' and c['screen']['visibleRatio']>=.35
 assert Path(name).name==name and (OUT/'browser'/name).is_file()
p=next(p for p in b['primal'] if p['device']=='mobile' and p['pet']=='cyrufas');v=p['visibility']['cross']
source=v['redEvidenceSource'];assert source['kind']=='supplemental native cast' and source['report']=='final-primal-red-probe.json' and source['sourceScope']==red['sourceScope']
assert 'separate from original 20-case cast' in red['sourceScope']
assert {e['screenshot'] for e in v['redEffectEvidence']}==set(accepted)
for e in v['redEffectEvidence']:
 c=accepted[e['screenshot']]
 assert e['frame']==c['frame'] and e['screen']==c['screen'] and e['visualAccepted']
 assert e['sourceReport']==source['report'] and e['sourceScope']==source['sourceScope']
raw=read('browser/'+source['originalReport']);assert raw['binary_sha256']==digest
assert [(c['case'],c['passed']) for c in raw['checks']]==[(c['case'],c['passed']) for c in b['checks']]
for old,new in zip(raw['primal'],b['primal']):
 for key in ('device','pet','details','album','start','idle','attack','countdown','adult'):assert old[key]==new[key],('original business evidence changed',key)
 for key in ('events','samples','requests'):assert old['cross'][key]==new['cross'][key]
http=read('binary-http-verification.json');assert http['binary_sha256']==digest
assert len(http['served_embedded_files_identical'])==len(list((ROOT/'client/dist').glob('*.js')))+2
assert len(http['served_patch_assets_identical'])==26 and len(http['private_urls'])==11
stop=read('binary-http-shutdown.json');assert stop['binary_sha256']==digest and stop['checks_exit_code']==stop['exit_code']==0 and not stop.get('forced_stop')
r=read('build-repeatability.json');assert r['exit_code']==0 and r['before_sha256']==r['after_sha256']==digest
server_inputs=read('server-source-inputs.json');assert all(sha(ROOT/n)==v for n,v in server_inputs.items()),'server inputs changed'
inputs=read('source-inputs.json');assert all(sha(ROOT/n)==v for n,v in inputs.items()),'source changed since final build'
package=read('package-verification.json');assert package['binary_sha256']==digest and sha(ROOT/package['archive'])==package['sha256']
assert (ROOT/'bin/saserver.sha256').read_text().split()[0]==digest
assert (ROOT/(package['archive']+'.sha256')).read_text().split()[0]==package['sha256']
assert (ROOT/package['archive']).stat().st_mode&0o777==0o644
for n in ('bin/saserver-v0.2.15-LYNX-linux-amd64.zip','bin/saserver-v0.2.15-LYNX-linux-amd64.zip.sha256'):assert not (ROOT/n).exists()
art=read('art-validation.json');assert art['all_128_actions_animated'] and not art['clipped_frames'] and art['character_frames']==752
for f in ('ai-pets','lilith','lisarido','primal-claws'):
 m=json.loads((ROOT/f'update/{f}-v1-assets.manifest.json').read_text());assert sha(ROOT/'update'/m['archive']['name'])==m['archive']['sha256']
 assert all(sha(ROOT/'assets'/e['path'])==e['sha256'] for e in m['entries'])
installers={n:read(n+'-install-tests.json')['passed'] for n in ('ai-pets','lilith','lisarido','primal-claws')}
assert all(n==30 for n in installers.values())
release={'version':VERSION,'baseline_commit':'9689b9c8b84a8f0f878a2133f3813e31747125d0','baseline_version':'v0.2.15-LYNX',
 'prompt_input_sha256':(OUT/'prompt-input.sha256').read_text().split()[0],'prompt_delivered_sha256':prompt_digest,
 'binary':{'path':'bin/saserver','bytes':(ROOT/'bin/saserver').stat().st_size,'sha256':digest,'format':'static ELF64 Linux AMD64','mode':'0755'},
 'archive':package,'source_files_verified':len(inputs),'old_zip_replaced':True,
 'checks':{'client_and_builder':total,'typescript':True,'go_all':True,'go_vet':True,'targeted_server_race':True,'browser_checks':browser_count,'native_pet_checks':20,'mobile_camera_checks':14,'mobile_claw_viewport_visibility':True,'supplemental_red_capture':True,'embedded_files':len(http['served_embedded_files_identical']),'patch_assets':26,'installer_cases':installers,'repeat_binary_identical':True,'repeat_art_identical':read('art-repeatability.json')['archive_identical']},
 'art':{'character_frames':752,'effect_frames':24,'actions':128,'source_sha256':{n:sha(ROOT/f'img/{n}.jpg') for n in ('cyrufas','claudes')},'origin':'Uploaded JPG eight-way cutouts, manually segmented local hinges and authored deterministic raster claw effects; no external image API.'},
 'scope':'Actual Linux ELF, original assets, WebSocket, private SQLite, Chromium with SwiftShader and emulated mobile touch/viewports. No physical Android/iOS/Safari certification. Pose quality is a visual judgment, not a proof from automated tests.'}
(OUT/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'version':VERSION,'client_checks':total,'browser_checks':browser_count,'binary_sha256':digest,'zip_sha256':package['sha256']}))
