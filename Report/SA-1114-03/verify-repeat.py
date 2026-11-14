"""Rebuild identical frozen inputs and compare the actual static executable."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = [p for group in ('server', 'client/src', 'client/test', 'scripts') for p in (ROOT/group).rglob('*')
         if p.is_file() and p.suffix in ('.go', '.ts', '.mjs', '.py', '.sh') and 'client/dist' not in p.as_posix()
         and 'internal/web/client' not in p.as_posix()]
files += list((ROOT/'client/dist').glob('*.js'))
files += [ROOT/p for p in ('server/go.mod', 'server/go.sum', 'server/internal/data/lilith.json', 'server/internal/data/ai_pets.json', 'client/index.html', 'client/build.mjs', 'client/art/login.png')]
inputs = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(set(files))}
before = sha(ROOT/'bin/saserver')
result = subprocess.run(['bash', 'scripts/build-linux.sh'], cwd=ROOT)
after = sha(ROOT/'bin/saserver')
assert result.returncode == 0 and before == after, 'repeat binary differs'
assert all(sha(ROOT/p) == digest for p, digest in inputs.items()), 'frozen inputs changed during build'
(OUT/'source-inputs.json').write_text(json.dumps(inputs, indent=2)+'\n')
report = {'exit_code': result.returncode, 'before_sha256': before, 'after_sha256': after, 'source_files': len(inputs)}
(OUT/'build-repeatability.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
