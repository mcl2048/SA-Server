"""Collect public validation logs; never copy private runtime logs or credentials."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parent
logs = {
    "go-test.txt": "/tmp/sa111302-final-validation.log",
    "go-vet.txt": "/tmp/sa111302-final-vet.log",
    "world-race.txt": "/tmp/sa111302-world-race.log",
    "client-tests.txt": "/tmp/sa111302-final-client.log",
    "typescript.txt": "/tmp/sa111302-final-tsc.log",
    "installer-tests.txt": "/tmp/sa111302-installer.log",
    "build.txt": "/tmp/sa111302-final-build.log",
}
for name, source in logs.items():
    (out / name).write_text(Path(source).read_text())
print(json.dumps({"collected": list(logs)}, indent=2))
