#!/usr/bin/env python3
"""Package the matching embedded Linux release with an explicit public allowlist.

Runtime databases, local configuration and the original Assets tree never enter
this archive. The existing optional AI-pet patch is included for fresh installs.
"""
from pathlib import Path
import hashlib
import os
import stat
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = "v0.2.10-LYNX"
DEST = ROOT / "bin" / f"saserver-{VERSION}-linux-amd64.zip"

def main():
    paths = [ROOT / p for p in (
        "bin/saserver", "bin/saserver.sha256", "config.yaml", "README.md",
        "CHANGELOG.md", "docs/手册.md", "docs/v0.2.10-LYNX.md", "update/README.md",
        "update/ai-pets-v1-assets.tar.gz", "update/ai-pets-v1-assets.manifest.json",
        "update/install-ai-pets.py", "update/install-ai-pets.sh",
    )]
    paths += sorted((ROOT / "gamedata").rglob("*"))
    public = []
    for path in paths:
        if path.is_symlink():
            raise ValueError(f"symlink in public package: {path}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"missing release input: {path}")
        public.append(path)
    digest = hashlib.sha256((ROOT / "bin/saserver").read_bytes()).hexdigest()
    if (ROOT / "bin/saserver.sha256").read_text().split()[0] != digest:
        raise ValueError("binary does not match its published digest")
    fd, temporary = tempfile.mkstemp(prefix=".release-", suffix=".zip", dir=DEST.parent)
    os.close(fd)
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in public:
            rel = path.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo(f"saserver-{VERSION}/{rel}", (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            mode = 0o755 if rel in ("bin/saserver", "update/install-ai-pets.sh") else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes(), compresslevel=9)
    with zipfile.ZipFile(temporary) as archive:
        if archive.testzip() is not None:
            raise ValueError("archive integrity failure")
    # Both paths are verified fixed children of bin; failed packaging preserves
    # the previous valid archive, just like build-linux.sh preserves its binary.
    if Path(temporary).parent.resolve() != DEST.parent.resolve():
        raise ValueError("unexpected temporary archive path")
    os.replace(temporary, DEST)
    print(f"{DEST.name}: {DEST.stat().st_size} bytes, {len(public)} files")
    print(f"SHA256 {hashlib.sha256(DEST.read_bytes()).hexdigest()}")

if __name__ == "__main__":
    main()
