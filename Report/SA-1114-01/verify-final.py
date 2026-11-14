"""Cross-check final evidence against one binary and write the release manifest."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
VERSION='v0.2.12-LYNX'
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda name:json.loads((OUT/name).read_text())
binary=ROOT/'bin/saserver'
digest=sha(binary.read_bytes())
assert subprocess.check_output([str(binary),'--version'],text=True).strip()==VERSION
for name in ('go-test-status.json','go-race-status.json','final-matrix-status.json','candidate-knockout-status.json'):
    status=read(name)
    assert status['state']=='finished' and status['exit_code']==0,(name,status)
checks=read('final-checks-status.json')
assert checks['state']=='finished' and checks['success'] and all(c['exit_code']==0 for c in checks['checks'])
log=(OUT/'client-tests.txt').read_text()
assert 'ℹ tests 151' in log and 'ℹ pass 151' in log and 'ℹ fail 0' in log
cases={}
for name,count in (('browser/final-real-game.json',62),('browser/candidate-knockout.json',4)):
    report=read(name)
    assert report['binary_sha256']==digest and report['binary_version']==VERSION
    assert not report['errors'] and not report.get('failure')
    assert len(report['checks'])==count and all(c['passed'] for c in report['checks'])
    assert report['shutdown']['exit_code']==0 and report['shutdown']['position_matches'] and not report['shutdown']['timed_out']
    cases[name]=count
http=read('binary-http-verification.json')
assert http['binary_sha256']==digest and len(http['served_embedded_files_identical'])==46
stop=read('binary-http-shutdown.json')
assert stop['binary_sha256']==digest and stop['checks_exit_code']==0 and stop['exit_code']==0
repeat=read('build-repeatability.json')
assert repeat['exit_code']==0 and repeat['before_sha256']==digest==repeat['after_sha256']
inputs=read('source-inputs.json')
assert all(sha((ROOT/name).read_bytes())==value for name,value in inputs.items())
package=read('package-verification.json')
assert package['binary_sha256']==digest and sha((ROOT/package['archive']).read_bytes())==package['sha256']
status=read('package-status.json')
assert status['state']=='finished' and status['package_exit_code']==0 and status['verify_exit_code']==0
assert not (ROOT/'bin/saserver-v0.2.11-LYNX-linux-amd64.zip').exists()
result={'version':VERSION,'baseline_commit':'1c5bd7f','baseline_version':'v0.2.11-LYNX',
        'binary':{'path':'bin/saserver','bytes':binary.stat().st_size,'sha256':digest,'format':'static ELF64 Linux AMD64','mode':'0755'},
        'archive':package,'old_zip_replaced':True,'asset_changes':False,
        'source_input_manifest':'Report/SA-1114-01/source-inputs.json','source_input_manifest_sha256':sha((OUT/'source-inputs.json').read_bytes()),
        'source_files_verified':len(inputs),'client_modules':44,'embedded_files':46,
        'checks':{'Go_all_packages_exit':0,'Go_race_all_packages_exit':0,'client_and_builder_tests_pass':151,'TypeScript_exit':0,'Go_vet_exit':0,
                  'browser_matrix_pass':62,'real_knockout_modes_pass':4,'browser_page_errors':0,'binary_rebuild_identical':True},
        'browser_reports':cases,'validation_boundary':'Real Chromium and release ELF; touch/viewports emulated, SwiftShader GPU. No physical Android/iOS or Safari certification.',
        'acceptance':'Report/SA-1114-01/ACCEPTANCE.md'}
(OUT/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'version':VERSION,'binary_sha256':digest,'archive_sha256':package['sha256'],'browser_checks':sum(cases.values()),'client_checks':151}))
