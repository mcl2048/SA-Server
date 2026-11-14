"""Validate the public archive against current release inputs, without runtime data."""
from pathlib import Path
import hashlib
import json
import stat
import zipfile

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
VERSION='v0.2.12-LYNX'
archive=ROOT/'bin'/f'saserver-{VERSION}-linux-amd64.zip'
sha=lambda data:hashlib.sha256(data).hexdigest()
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert len(names)==len(set(names)), 'duplicate public archive entries'
    for name in names:
        parts=Path(name).parts
        assert parts[0]==f'saserver-{VERSION}' and '..' not in parts
        rel=Path(*parts[1:])
        assert not any(p.lower()=='assets' for p in rel.parts)
        assert rel.suffix.lower() not in ('.db','.sqlite','.sqlite3') and not rel.name.endswith(('-wal','-shm'))
        assert rel.name not in ('config.local.yaml','credentials.json') and '.git' not in rel.parts
        assert z.read(name)==(ROOT/rel).read_bytes(), f'archive mismatch: {rel}'
    binary=f'saserver-{VERSION}/bin/saserver'
    assert stat.S_IMODE(z.getinfo(binary).external_attr>>16)==0o755
    digest=sha(z.read(binary))
    assert digest==(ROOT/'bin/saserver.sha256').read_text().split()[0]
    assert VERSION.encode() in z.read(f'saserver-{VERSION}/README.md')
result={'version':VERSION,'archive':archive.relative_to(ROOT).as_posix(),'bytes':archive.stat().st_size,
        'sha256':sha(archive.read_bytes()),'files':len(names),'binary_sha256':digest,
        'all_entries_match_current_public_files':True,'executable_mode':'0755',
        'runtime_db_credentials_and_Assets_excluded':True}
(OUT/'package-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
