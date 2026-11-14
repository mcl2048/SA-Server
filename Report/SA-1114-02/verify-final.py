"""Cross-check the final source, executable, browser and archive evidence."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
VERSION='v0.2.13-LYNX';sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda n:json.loads((OUT/n).read_text())
binary=ROOT/'bin/saserver';digest=sha(binary.read_bytes())
assert subprocess.check_output([str(binary),'--version'],text=True).strip()==VERSION
checks=read('checks-status.json');assert checks['state']=='finished' and checks['success'] and all(c['exit_code']==0 for c in checks['checks'])
for name in ('go-test-status.json','go-vet-status.json','http-status.json','final-matrix-status.json'):
 s=read(name);assert s['state']=='finished' and s['exit_code']==0,(name,s)
log=(OUT/'client-tests.txt').read_text();total=int(re.search(r'ℹ tests (\d+)',log)[1]);passed=int(re.search(r'ℹ pass (\d+)',log)[1]);assert total==passed and 'ℹ fail 0' in log
browser=read('browser/final-real-game.json')
assert browser['binary_sha256']==digest and browser['binary_version']==VERSION
assert not browser.get('failure') and not browser['errors'] and len(browser['checks'])==83 and all(c['passed'] for c in browser['checks'])
assert browser['shutdown']['exit_code']==0 and browser['shutdown']['position_matches'] and not browser['shutdown']['timed_out']
http=read('binary-http-verification.json');assert http['binary_sha256']==digest and len(http['served_embedded_files_identical'])==46
stop=read('binary-http-shutdown.json');assert stop['binary_sha256']==digest and stop['checks_exit_code']==0 and stop['exit_code']==0
repeat=read('build-repeatability.json');assert repeat['exit_code']==0 and repeat['before_sha256']==digest==repeat['after_sha256']
inputs=read('source-inputs.json');assert all(sha((ROOT/p).read_bytes())==v for p,v in inputs.items())
package=read('package-verification.json');assert package['binary_sha256']==digest and sha((ROOT/package['archive']).read_bytes())==package['sha256']
assert not (ROOT/'bin/saserver-v0.2.12-LYNX-linux-amd64.zip').exists()
assert (ROOT/'bin/saserver.sha256').read_text().split()[0]==digest
assert (ROOT/(package['archive']+'.sha256')).read_text().split()[0]==package['sha256']
assert (ROOT/package['archive']).stat().st_mode & 0o777==0o644
result={'version':VERSION,'baseline_commit':'b8e8195eacff3319e890d2a3e006d0db8675509d','baseline_version':'v0.2.12-LYNX',
 'binary':{'path':'bin/saserver','bytes':binary.stat().st_size,'sha256':digest,'format':'static ELF64 Linux AMD64','mode':'0755'},
 'archive':package,'old_zip_replaced':True,'asset_changes':False,'source_input_manifest':'Report/SA-1114-02/source-inputs.json','source_files_verified':len(inputs),'client_modules':44,'embedded_files':46,
 'checks':{'client_and_builder_tests_pass':total,'TypeScript_exit':0,'Go_all_packages_exit':0,'Go_vet_exit':0,'server_targeted_race_real_actions':True,'browser_checks':len(browser['checks']),'browser_errors':0,'repeat_binary_identical':True},
 'browser_report':'Report/SA-1114-02/browser/final-real-game.json','scope':'Actual release ELF and real Chromium; SwiftShader GPU, emulated touch and viewport sizes. No physical Android/iOS or Safari certification.',
 'acceptance':'Report/SA-1114-02/ACCEPTANCE.md'}
(OUT/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'version':VERSION,'binary_sha256':digest,'archive_sha256':package['sha256'],'browser_checks':len(browser['checks']),'client_checks':total}))
