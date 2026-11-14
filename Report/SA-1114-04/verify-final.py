"""Accept only matching frozen inputs and complete final-ELF evidence."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
VERSION = 'v0.2.15-LYNX'
read = lambda name: json.loads((OUT/name).read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
digest = sha(ROOT/'bin/saserver')
prompt_digest = sha(ROOT/'Prompt/Task-Now.txt')
assert (OUT/'prompt-delivered.sha256').read_text().split()[0] == prompt_digest
assert subprocess.check_output([str(ROOT/'bin/saserver'),'--version'],text=True).strip() == VERSION
checks = read('checks-status.json')
assert checks['state'] == 'finished' and checks['success'] and all(c['exit_code']==0 for c in checks['checks'])
for name in ('final-source-checks','server-package-tests','server-race','http','repeat-build','art-repeatability','package','lisarido-browser','mobile-regression'):
    status=read(name+'-status.json')
    assert status['state']=='finished' and status['exit_code']==0, (name,status)
text=(OUT/'client-tests.txt').read_text()
total, passed=(int(re.search(pattern,text)[1]) for pattern in (r'ℹ tests (\d+)',r'ℹ pass (\d+)'))
assert total==passed and 'ℹ fail 0' in text
browser_count=0
for filename,expected in (('final-lisarido.json',6),('final-mobile-regression.json',14)):
    b=read('browser/'+filename)
    assert b['binary_sha256']==digest and b['binary_version']==VERSION
    assert not b.get('failure') and not b['errors']
    assert len(b['checks'])==expected and all(c['passed'] for c in b['checks'])
    assert b['shutdown']['exit_code']==0 and not b['shutdown']['timed_out'] and b['shutdown']['position_matches']
    browser_count+=len(b['checks'])
lisarido=read('browser/final-lisarido.json')
assert {c['device'] for c in lisarido['lisarido']}=={'desktop','mobile'}
assert len(lisarido['lisarido'])==2
for device in lisarido['lisarido']:
    assert device['paralyzed'] and device['departed']
    assert any(len([e for t in r['events'] for e in t['events'] if e['effect']==199301])==5 for r in device['rounds'])
http=read('binary-http-verification.json')
assert http['binary_sha256']==digest
assert len(http['served_embedded_files_identical'])==len(list((ROOT/'client/dist').glob('*.js')))+2
assert len(http['served_patch_assets_identical'])==19 and len(http['private_urls'])==11
stop=read('binary-http-shutdown.json')
assert stop['binary_sha256']==digest and stop['checks_exit_code']==stop['exit_code']==0 and not stop.get('forced_stop')
repeat=read('build-repeatability.json')
assert repeat['exit_code']==0 and repeat['before_sha256']==repeat['after_sha256']==digest
inputs=read('source-inputs.json')
assert all(sha(ROOT/name)==expected for name,expected in inputs.items()), 'frozen inputs changed'
package=read('package-verification.json')
assert package['binary_sha256']==digest and sha(ROOT/package['archive'])==package['sha256']
assert (ROOT/'bin/saserver.sha256').read_text().split()[0]==digest
assert (ROOT/(package['archive']+'.sha256')).read_text().split()[0]==package['sha256']
assert (ROOT/package['archive']).stat().st_mode & 0o777==0o644
assert not (ROOT/'bin/saserver-v0.2.14-LYNX-linux-amd64.zip').exists()
assert not (ROOT/'bin/saserver-v0.2.14-LYNX-linux-amd64.zip.sha256').exists()
art=read('art-validation.json')
assert art['all_64_actions_animated'] and art['clipped_opaque_character_frames']==0
assert art['idle_body_height_px']['frames']==32 and 95<=art['idle_body_height_px']['min']<=art['idle_body_height_px']['max']<=100
for filename in ('ai-pets-v1-assets.manifest.json','lilith-v1-assets.manifest.json','lisarido-v1-assets.manifest.json'):
    patch=json.loads((ROOT/'update'/filename).read_text())
    assert sha(ROOT/'update'/patch['archive']['name'])==patch['archive']['sha256']
    assert all(sha(ROOT/'assets'/e['path'])==e['sha256'] for e in patch['entries'])
installers={name:read(name+'-install-tests.json')['passed'] for name in ('ai-pets','lilith','lisarido')}
release={
    'version':VERSION,'baseline_commit':'811193ab4b4bfd3db07a848cab4487ef1860d44c',
    'baseline_version':'v0.2.14-LYNX','prompt_input_sha256':(OUT/'prompt-input.sha256').read_text().split()[0],
    'prompt_delivered_sha256':prompt_digest,
    'binary':{'path':'bin/saserver','bytes':(ROOT/'bin/saserver').stat().st_size,'sha256':digest,'format':'static ELF64 Linux AMD64','mode':'0755'},
    'archive':package,'source_files_verified':len(inputs),'old_zip_replaced':True,
    'checks':{'client_and_builder':total,'typescript':True,'go_all':True,'go_vet':True,'targeted_server_race':True,
              'browser_checks':browser_count,'native_pet_checks':6,'mobile_camera_checks':14,
              'embedded_files':len(http['served_embedded_files_identical']),'patch_assets':19,'installer_cases':installers,
              'repeat_binary_identical':True,'repeat_art_identical':read('art-repeatability.json')['archive_identical']},
    'art':{'character_frames':232,'effect_frames':24,'idle_body_height_px':art['idle_body_height_px'],
           'source':'img/lisarido.jpg','source_sha256':sha(ROOT/'img/lisarido.jpg'),
           'origin':'User-provided JPG extraction, local ear/cannon layer animation and deterministic raster FX; no image generation API called.'},
    'scope':'Actual Linux ELF, original assets, WebSocket, private SQLite and Chromium with SwiftShader; emulated mobile viewport and touch, no physical Android/iOS or Safari certification.'}
(OUT/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'version':VERSION,'client_checks':total,'browser_checks':browser_count,'binary_sha256':digest,'zip_sha256':package['sha256']}))
