"""Cross-check final release inputs and independently retained evidence."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
VERSION = 'v0.2.14-LYNX'
read = lambda p: json.loads((OUT/p).read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
digest = sha(ROOT/'bin/saserver')
prompt_digest = sha(ROOT/'Prompt/Task-Now.txt')
assert (OUT/'prompt-delivered.sha256').read_text().split()[0] == prompt_digest
assert subprocess.check_output([str(ROOT/'bin/saserver'), '--version'], text=True).strip() == VERSION
checks = read('checks-status.json')
assert checks['success'] and all(c['exit_code'] == 0 for c in checks['checks'])
for name in ('final-source-checks', 'mobile-browser', 'recovery-browser', 'lilith-browser', 'http', 'repeat-build', 'art-repeatability', 'package'):
    status = read(name+'-status.json')
    assert status['state'] == 'finished' and status['exit_code'] == 0, (name, status)
text = (OUT/'client-tests.txt').read_text()
total, passed = (int(re.search(pattern, text)[1]) for pattern in (r'ℹ tests (\d+)', r'ℹ pass (\d+)'))
assert total == passed and 'ℹ fail 0' in text
browser_checks = 0
for filename, expected in (('final-mobile-regression.json', 14), ('final-recovery.json', 26), ('final-lilith.json', 6)):
    b = read('browser/'+filename)
    assert b['binary_sha256'] == digest and b['binary_version'] == VERSION
    assert not b.get('failure') and not b['errors'] and len(b['checks']) == expected
    assert all(c['passed'] for c in b['checks'])
    assert b['shutdown']['exit_code'] == 0 and not b['shutdown']['timed_out'] and b['shutdown']['position_matches']
    browser_checks += len(b['checks'])
recovery = read('browser/final-recovery.json')
assert len(recovery['recovery']) == 24
assert {case['device'] for case in recovery['recovery']} == {'desktop', 'mobile'}
assert {case['mode'] for case in recovery['recovery']} == {'automatic', 'quick'}
http = read('binary-http-verification.json')
assert http['binary_sha256'] == digest and len(http['served_embedded_files_identical']) == len(list((ROOT/'client/dist').glob('*.js')))+2
assert len(http['private_urls']) == 11
stop = read('binary-http-shutdown.json')
assert stop['binary_sha256'] == digest and stop['checks_exit_code'] == stop['exit_code'] == 0
repeat = read('build-repeatability.json')
assert repeat['exit_code'] == 0 and repeat['before_sha256'] == repeat['after_sha256'] == digest
inputs = read('source-inputs.json')
assert all(sha(ROOT/p) == value for p, value in inputs.items()), 'frozen source inputs changed'
package = read('package-verification.json')
assert package['binary_sha256'] == digest and sha(ROOT/package['archive']) == package['sha256']
assert (ROOT/'bin/saserver.sha256').read_text().split()[0] == digest
assert (ROOT/(package['archive']+'.sha256')).read_text().split()[0] == package['sha256']
assert (ROOT/package['archive']).stat().st_mode & 0o777 == 0o644
assert not (ROOT/'bin/saserver-v0.2.13-LYNX-linux-amd64.zip').exists()
assert not (ROOT/'bin/saserver-v0.2.13-LYNX-linux-amd64.zip.sha256').exists()
lilith = read('browser/final-lilith.json')
assert len(lilith['lilith']) == 2 and {c['device'] for c in lilith['lilith']} == {'desktop','mobile'}
character = json.loads((ROOT/'assets/extensions/lilith-v1/anim/199200.json').read_text())
# The middle three attack frames contain the blue/purple energy. Seeing only
# an attack-start pose would prove animation selection, but not energy output.
energy_frames = {frame[0] for act in character['actions'] if act['type'] == 0 for frame in act['frames'][1:4]}
for device in lilith['lilith']:
    rendered = {quad['image'] for sample in device['attack']['samples'] if sample['actor']['action'] == 0
                for quad in sample['charQuads'] if quad['image'] == sample['actor']['frame']}
    assert rendered & energy_frames, (device['device'], 'no actual energy texture was rendered')
art = read('lilith-art-validation.json')
assert art['all_actions_animated'] and art['clipped_opaque_character_frames'] == 0
assert art['idle_body_height_px']['frames'] == 32
assert abs(art['body_to_front_dragon_height_ratio']['min'] - 2/3) < .025
assert abs(art['body_to_front_dragon_height_ratio']['max'] - 2/3) < .025
patch = json.loads((ROOT/'update/lilith-v1-assets.manifest.json').read_text())
assert sha(ROOT/'update'/patch['archive']['name']) == patch['archive']['sha256']
for entry in patch['entries']:
    assert sha(ROOT/'assets'/entry['path']) == entry['sha256']
assert len(http['served_patch_assets_identical']) == 14
release = {
    'version': VERSION, 'baseline_commit': '256f7abb09059b69917133518509ca2b5480e842', 'baseline_version': 'v0.2.13-LYNX',
    'prompt_input_sha256': (OUT/'prompt-updated.sha256').read_text().split()[0], 'prompt_delivered_sha256': prompt_digest,
    'binary': {'path': 'bin/saserver', 'bytes': (ROOT/'bin/saserver').stat().st_size, 'sha256': digest, 'format': 'static ELF64 Linux AMD64', 'mode': '0755'},
    'archive': package, 'old_zip_replaced': True, 'asset_changes': True, 'source_files_verified': len(inputs),
    'checks': {'client_and_builder': total, 'typescript_exit': 0, 'go_all_exit': 0, 'go_vet_exit': 0,
               'battle_and_automation_race': True, 'browser_checks': browser_checks, 'recovery_battles': 24,
               'embedded_files': len(http['served_embedded_files_identical']), 'lilith_browser_checks': 6, 'lilith_frames': 208, 'ghost_storm_frames': 28, 'lilith_installer_cases': read('lilith-install-tests.json')['passed'], 'repeat_binary_identical': True},
    'scope': 'Actual Linux release ELF, original assets and Chromium; SwiftShader and emulated mobile viewport/touch. No physical Android/iOS or Safari certification.'}
(OUT/'release.json').write_text(json.dumps(release, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'version': VERSION, 'binary_sha256': digest, 'archive_sha256': package['sha256'], 'browser_checks': browser_checks, 'client_checks': total}))
