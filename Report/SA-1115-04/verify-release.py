"""Validate exact tested source, Linux ELF, actual HTTP/browser, and public ZIP."""
from pathlib import Path
import hashlib,json,re,struct,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent
VERSION='v0.2.22-LYNX'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 binary=ROOT/'bin/saserver';digest=sha(binary);elf=binary.read_bytes()
 assert subprocess.check_output([str(binary),'--version'],text=True).strip()==VERSION
 assert elf[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',elf,18)[0]==62
 off=struct.unpack_from('<Q',elf,32)[0];size,count=struct.unpack_from('<HH',elf,54)
 assert all(struct.unpack_from('<I',elf,off+i*size)[0]!=3 for i in range(count))
 assert binary.stat().st_mode&0o111 and (ROOT/'bin/saserver.sha256').read_text().split()[0]==digest
 inputs=json.loads((OUT/'production-inputs.json').read_text());assert inputs['binary_sha256']==digest
 for rel,expected in inputs['files'].items():assert sha(ROOT/rel)==expected,rel
 repeat=json.loads((OUT/'build-repeatability.json').read_text());assert repeat['identical'] and repeat['binary_sha256']==digest
 client=(OUT/'client-tests.txt').read_text();passed=int(re.search(r'pass (\d+)\b',client)[1]);assert passed>=274 and re.search(r'fail 0\b',client)
 assert not (OUT/'typescript.txt').read_text().strip() and not (OUT/'go-vet-final.txt').read_text().strip()
 race=json.loads((OUT/'go-race-status.json').read_text());assert race['complete'] and race['source_stable']
 world=json.loads((OUT/'go-race-world-status.json').read_text());assert world['complete'] and world['exit_code']==0
 normal_status=json.loads((OUT/'go-normal-status.json').read_text());assert normal_status['complete'] and normal_status['success'] and normal_status['source_stable']
 normal=(OUT/'go-test-final.txt').read_text();raced=(OUT/'go-race.txt').read_text();world_log=(OUT/'go-race-world.txt').read_text()
 assert 'panic: test timed out after 4m0s' in raced
 assert re.findall(r'^FAIL\s+(sa/server/\S+)',raced,re.M)==['sa/server/internal/world']
 assert not re.search(r'WARNING: DATA RACE',raced+world_log)
 assert re.search(r'^ok\s+sa/server/internal/world\s',world_log,re.M) and not re.search(r'^FAIL\b',world_log,re.M)
 for package in ('cmd/saserver','internal/battle','internal/data','internal/server','internal/store','internal/world','tests','webclient'):
  assert re.search(r'^ok\s+sa/server/'+package+r'\s',normal,re.M),package
  if package!='internal/world':assert re.search(r'^ok\s+sa/server/'+package+r'\s',raced,re.M),package
 assert not re.search(r'^FAIL\b|WARNING: DATA RACE',normal,re.M)
 http=json.loads((OUT/'http-content.json').read_text());assert http['success'] and http['matched']==78 and http['binary_sha256']==digest and http['shutdown']['exit_code']==0
 for item in http['files']:
  rel=item['url'].lstrip('/');path=ROOT/rel if rel.startswith('assets/') else ROOT/'server/webclient/static'/rel
  assert sha(path)==item['sha256'],rel
 status=json.loads((OUT/'browser/final-navigation-status.json').read_text());assert status['exit_code']==0 and status['binary_sha256']==digest
 browser=json.loads((OUT/'browser/final-navigation.json').read_text())
 assert browser['binary_sha256']==digest and browser['binary_version']==VERSION
 assert not browser.get('failure') and not browser.get('errors') and browser['checks']
 assert all(c['passed'] is True for c in browser['checks'])
 assert all(any(c.get('device')==d for c in browser['checks']) for d in ('desktop','mobile'))
 assert browser['shutdown']['exit_code']==0 and not browser['shutdown']['timed_out'] and browser['shutdown']['position_matches']
 archive=ROOT/'bin'/f'saserver-{VERSION}-linux-amd64.zip';prefix=f'saserver-{VERSION}/'
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None;names=z.namelist();assert len(names)==len(set(names))
  for name in names:
   assert name.startswith(prefix),name
   rel=name[len(prefix):];assert not rel.lower().startswith('assets/') and not rel.endswith(('.db','.sqlite','.db-wal','.db-shm'))
   assert 'config.local' not in rel and '..' not in Path(rel).parts
   assert z.read(name)==(ROOT/rel).read_bytes(),rel
  assert z.getinfo(prefix+'bin/saserver').external_attr>>16&0o111
  assert prefix+'docs/v0.2.22-LYNX.md' in names
  assert prefix+'docs/skills/stoneage/references/automation-and-navigation.md' in names
 assert archive.with_name(archive.name+'.sha256').read_text().split()[0]==sha(archive)
 assert list((ROOT/'bin').glob('*.zip'))==[archive],'stale ZIP remains'
 result={'success':True,'version':VERSION,'binary_sha256':digest,'linux_amd64_static':True,'binary_bytes':binary.stat().st_size,'production_inputs':len(inputs['files']),'repeat_identical':True,'client_tests':passed,'go_test_race_vet':True,'race_validation':{'initial_world_package_timeout_seconds':240,'world_retry_timeout_seconds':600,'world_retry_seconds':world['seconds'],'all_packages_passed_across_attempts':True},'typescript':True,'http_files':http['matched'],'browser':{'checks':len(browser['checks']),'browser':browser['browser'],'shutdown':browser['shutdown']},'package':{'path':str(archive.relative_to(ROOT)),'bytes':archive.stat().st_size,'files':len(names),'sha256':sha(archive)},'limits':['Chromium viewport/touch emulation; no physical Android/iOS/Safari certification','No production restart or deployment','Moving NPC snapshots refresh while map visible; no predictive pursuit','Only effective step-in warps are automatic entrances; dialogue/scripts/conditions stay authoritative']}
 (OUT/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
