"""Run the distributed installer against real archived v1/v2 payloads."""
from pathlib import Path
import hashlib,json,shutil,subprocess,tarfile,tempfile
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
with tempfile.TemporaryDirectory(prefix='sa-primal-angle-upgrade-') as temporary:
 root=Path(temporary);update=root/'update';update.mkdir();assets=root/'Assets';assets.mkdir()
 for name in ('install-primal-claws.sh','install-primal-claws.py','primal-claws-v1-assets.manifest.json','primal-claws-v2-assets.manifest.json','primal-claws-v3-assets.manifest.json','primal-claws-v3-assets.tar.gz'):
  shutil.copy2(ROOT/'update'/name,update/name)
 old=json.loads((update/'primal-claws-v1-assets.manifest.json').read_text());expected={e['path']:e for e in old['entries']}
 archive=ROOT/'update/primal-claws-v1-assets.tar.gz';assert sha(archive.read_bytes())==old['archive']['sha256']
 with tarfile.open(archive,'r:gz') as tar:
  assert {m.name for m in tar.getmembers()}==set(expected)
  for member in tar.getmembers():
   assert member.isfile() and member.name in expected
   data=tar.extractfile(member).read();assert sha(data)==expected[member.name]['sha256']
   target=assets/member.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 old2=json.loads((update/'primal-claws-v2-assets.manifest.json').read_text());expected2={e['path']:e for e in old2['entries']}
 archive2=ROOT/'update/primal-claws-v2-assets.tar.gz';assert sha(archive2.read_bytes())==old2['archive']['sha256']
 with tarfile.open(archive2,'r:gz') as tar:
  assert {m.name for m in tar.getmembers()}==set(expected2)
  for member in tar.getmembers():
   assert member.isfile() and member.name in expected2
   data=tar.extractfile(member).read();assert sha(data)==expected2[member.name]['sha256']
   target=assets/member.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 base=assets/'base.bin' ;base.write_bytes(b'official-base-unchanged')
 other=assets/'extensions/other-pet-v1/sprite.png';other.parent.mkdir();other.write_bytes(b'other-pet-unchanged')
 run=lambda:subprocess.run(['bash',str(update/'install-primal-claws.sh'),'--assets',str(assets)],cwd='/',capture_output=True,text=True)
 first=run();assert first.returncode==0,first.stderr
 assert not (assets/'extensions/primal-claws-v1').exists() and not (assets/'extensions/primal-claws-v2').exists()
 new=json.loads((update/'primal-claws-v3-assets.manifest.json').read_text());assert len(new['entries'])==7
 for e in new['entries']:assert sha((assets/e['path']).read_bytes())==e['sha256']
 mtimes={str(p.relative_to(assets)):p.stat().st_mtime_ns for p in (assets/'extensions/primal-claws-v3').rglob('*')}
 second=run();assert second.returncode==0,second.stderr
 assert all((assets/name).stat().st_mtime_ns==stamp for name,stamp in mtimes.items())
 assert base.read_bytes()==b'official-base-unchanged' and other.read_bytes()==b'other-pet-unchanged'
 assert not any((assets/'extensions').glob('.primal-claws-*'))
 result={'passed':True,'real_v1_files_verified_then_removed':7,'real_v2_files_verified_then_removed':7,'real_v3_files_installed_and_verified':7,'repeat_preserves_all_v3_mtimes':True,'base_and_other_extension_unchanged':True,'first_output':first.stdout.replace(temporary,'[temporary]'),'repeat_output':second.stdout.replace(temporary,'[temporary]')}
(OUT/'real-upgrade.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
