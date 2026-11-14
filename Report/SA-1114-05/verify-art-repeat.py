"""Regenerate the atlas independently and compare all seven files and archive."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
PYTHON = '/tmp/loft-hyraken-paas-venv/bin/python'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
archive = ROOT/'update/primal-claws-v1-assets.tar.gz'
before = sha(archive)
expected = json.loads((ROOT/'update/primal-claws-v1-assets.manifest.json').read_text())
with tempfile.TemporaryDirectory(prefix='sa-1114-04-art-repeat-') as temporary:
    source = Path(temporary)/'primal-claws-v1'
    subprocess.run([PYTHON, str(ROOT/'scripts/generate-primal-claws.py'), '--output', str(source)], check=True, cwd=ROOT)
    for entry in expected['entries']:
        rel = Path(entry['path']).relative_to('extensions/primal-claws-v1')
        assert sha(source/rel) == entry['sha256'], rel
    subprocess.run(['python3', str(ROOT/'update/package-primal-claws.py'), '--source', str(source)], check=True, cwd=ROOT)
assert sha(archive) == before
result = {'all_seven_regenerated_files_identical': True, 'archive_identical': True, 'archive_sha256': before}
(OUT/'art-repeatability.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
