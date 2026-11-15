"""Fail closed if the public release diverges from its tested sources/artifacts."""
from pathlib import Path
import hashlib,json,re,struct,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
binary=ROOT/'bin/saserver';digest=sha(binary);version='v0.2.19-LYNX'
assert subprocess.check_output([str(binary),'--version'],text=True).strip()==version
elf=binary.read_bytes();assert elf[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',elf,18)[0]==62
phoff=struct.unpack_from('<Q',elf,32)[0];phsize,phcount=struct.unpack_from('<HH',elf,54)
assert all(struct.unpack_from('<I',elf,phoff+i*phsize)[0]!=3 for i in range(phcount)), 'unexpected ELF interpreter'
assert digest==(ROOT/'bin/saserver.sha256').read_text().split()[0]
inputs=json.loads((OUT/'source-inputs.json').read_text());assert inputs['binary_sha256']==digest
updates=inputs.get('test_only_updates_after_build',{})
assert set(updates)=={'scripts/update-lisarido.test.sh'}
for rel,expected in inputs['files'].items():
 if rel in updates:
  update=updates[rel];assert update['original_sha256']==expected and sha(ROOT/rel)==update['sha256'],rel
  assert json.loads((OUT/update['evidence']).read_text())['passed']==42
 else:assert sha(ROOT/rel)==expected,rel
repeat=json.loads((OUT/'build-repeatability.json').read_text());assert repeat['identical'] and repeat['binary_sha256']==digest
client=(OUT/'client-tests.txt').read_text();assert re.search(r'pass 244\b',client) and re.search(r'fail 0\b',client)
go=json.loads((OUT/'go-checks.json').read_text());assert go['success'] and go['complete']
assert not (OUT/'typescript.txt').read_text().strip()
assert json.loads((OUT/'lisarido/installer-green.json').read_text())['passed']==42
assert 'OK' in (OUT/'lisarido/art-green.txt').read_text()
http=json.loads((OUT/'http-content.json').read_text());assert http['binary_sha256']==digest and http['matched']==57
for item in http['files']:
 rel=item['url'];path=ROOT/rel if rel.startswith('assets/') else ROOT/'server/webclient/static'/rel
 assert sha(path)==item['sha256'],rel
browser={}
for key,rel in [('navigation','navigation/final-navigation.json'),('automation','browser/final-automation.json'),('lisarido','lisarido/browser/final-lisarido.json')]:
 data=json.loads((OUT/rel).read_text());assert data['binary_sha256']==digest,rel
 assert data['binary_version']==version,rel
 assert not data.get('failure') and not data.get('errors'),(rel,data.get('failure'),data.get('errors'))
 shutdown=data['shutdown'];assert shutdown['exit_code']==0 and not shutdown['timed_out'] and shutdown['position_matches'],rel
 assert len(data['checks'])=={'navigation':3,'automation':20,'lisarido':6}[key],rel
 assert all(c.get('passed') is True for c in data['checks']),rel
 browser[key]={'checks':len(data['checks']),'browser':data['browser'],'binary_sha256':data['binary_sha256'],'shutdown':shutdown}
automation=json.loads((OUT/'browser/final-automation.json').read_text())['automation']
assert len(automation)==20 and all(sum(c['device']==device for c in automation)==10 for device in ['desktop','mobile'])
manifest=json.loads((ROOT/'update/lisarido-v3-assets.manifest.json').read_text());archive=ROOT/'update'/manifest['archive']['name']
assert sha(archive)==manifest['archive']['sha256']
for entry in manifest['entries']:assert sha(ROOT/'assets'/entry['path'])==entry['sha256'],entry['path']
package=ROOT/'bin'/f'saserver-{version}-linux-amd64.zip'
with zipfile.ZipFile(package) as z:
 assert z.testzip() is None
 prefix=f'saserver-{version}/'
 for name in z.namelist():
  assert name.startswith(prefix);rel=name[len(prefix):]
  assert not rel.startswith('assets/') and not rel.endswith(('.db','.sqlite')) and 'config.local' not in rel,rel
  assert z.read(name)==(ROOT/rel).read_bytes(),rel
 assert z.getinfo(prefix+'bin/saserver').external_attr>>16 & 0o111
assert (ROOT/'bin'/f'{package.name}.sha256').read_text().split()[0]==sha(package)
assert not list((ROOT/'bin').glob('saserver-v0.2.18-*.zip'))
result={'success':True,'version':version,'binary_sha256':digest,'linux_amd64_static':True,'source_files':len(inputs['files']),
 'test_only_updates_after_build':updates,
 'client_tests':244,'go_all_and_vet':True,'http_files':57,'art_installer_cases':42,'browser':browser,
 'package':{'path':str(package.relative_to(ROOT)),'bytes':package.stat().st_size,'sha256':sha(package)},'art_package_sha256':sha(archive),
 'limitations':['Chromium viewport/touch emulation; no physical Android/iOS/Safari certification','Isolated fixtures; production was not restarted']}
(OUT/'release.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
