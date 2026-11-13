#!/usr/bin/env python3
"""Reproduce the offline package from an already generated ai-pets-v1 directory."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile

PREFIX = "extensions/ai-pets-v1"
RELATIVE = ["manifest.json"] + ["pages/%05d.png" % i for i in range(4)] + ["anim/%d.json" % i for i in range(199100, 199104)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="生成的ai-pets-v1目录，不含官方基础素材")
    args = parser.parse_args()
    source = args.source.absolute()
    for p in (source, *source.parents):
        if p.is_symlink():
            raise ValueError("Source path must not contain symlinks")
    found = set()
    for base, dirs, files in os.walk(source, followlinks=False):
        for name in dirs + files:
            if (Path(base) / name).is_symlink():
                raise ValueError("Source contains symlink")
        found.update((Path(base) / name).relative_to(source).as_posix() for name in files)
    if found != set(RELATIVE):
        raise ValueError("Source must contain exactly the nine known files: " + repr(sorted(found)))
    contents = {}
    for name in RELATIVE:
        path = source / name
        if not path.is_file():
            raise ValueError("Missing regular source file: " + name)
        data = path.read_bytes()
        if not data:
            raise ValueError("Empty source file: " + name)
        if name.endswith(".png"):
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Not PNG: " + name)
        else:
            json.loads(data)
        contents[PREFIX + "/" + name] = data
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(contents.items()):
            item = tarfile.TarInfo(name)
            item.size = len(data)
            item.mode = 0o644
            item.mtime = 0
            item.uid = item.gid = 0
            item.uname = item.gname = ""
            archive.addfile(item, io.BytesIO(data))
    packed = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=packed, mtime=0, compresslevel=9) as compressed:
        compressed.write(raw.getvalue())
    output = Path(__file__).resolve().parent
    package_name = "ai-pets-v1-assets.tar.gz"
    package = packed.getvalue()
    manifest = {
        "schemaVersion": 1,
        "packageId": "ai-pets-v1",
        "targetRoot": "assets/" + PREFIX,
        "installPrefix": PREFIX,
        "source": "Original generated mechanical pet extension; official base asset archive is excluded.",
        "archive": {"name": package_name, "size": len(package), "sha256": hashlib.sha256(package).hexdigest()},
        "entries": [{"path": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in sorted(contents.items())],
    }
    (output / package_name).write_bytes(package)
    (output / "ai-pets-v1-assets.manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(manifest["archive"], ensure_ascii=False))


if __name__ == "__main__":
    main()
