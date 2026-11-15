"""Read-only staged/release privacy audit; --write-report updates only this task's JSON.

Private fixture values are loaded into memory only. Neither matches nor errors
print credential bytes, encoded variants, or private runtime file contents.
Run after all public files (including a placeholder privacy-check.json) are staged.
"""
from __future__ import annotations

import argparse
import base64
import collections
import datetime
import glob
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
REPORT = (OUT / "privacy-check.json").relative_to(ROOT).as_posix()
TASK = OUT.name.lower()


def require(condition: bool, label: str) -> None:
    if not condition:
        raise RuntimeError(label)


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.DEVNULL)


def names(*args: str) -> list[str]:
    return [p.decode() for p in git(*args).split(b"\0") if p]


def audit(write_report: bool) -> dict:
    staged = names("diff", "--cached", "--no-renames", "--name-only", "-z", "--diff-filter=ACMR")
    unstaged = names("diff", "--name-only", "-z")
    untracked = names("ls-files", "--others", "--exclude-standard", "-z")
    require(bool(staged), "no staged payloads")
    require(REPORT in staged, "stage a placeholder privacy-check.json before the final audit")
    require(not unstaged, "unstaged files exist before privacy report update")
    require(not untracked, "untracked files exist before privacy report update")
    statuses = [v.decode() for v in git("diff", "--cached", "--no-renames", "--name-status", "-z").split(b"\0") if v]
    require(len(statuses) % 2 == 0, "invalid no-rename status format")
    rename_count = len(git("diff", "--cached", "--name-status").splitlines())

    metadata = sorted(set(glob.glob("/tmp/sa-1114-0*-runtime*.json") + glob.glob("/tmp/sa-primal-*runtime.json")))
    current_metadata = sorted(glob.glob("/tmp/sa-primal-angle-runtime.json"))
    require(bool(current_metadata), "current task private fixture metadata unavailable")
    credentials = {}
    for source in metadata:
        meta = json.loads(Path(source).read_text())
        path = Path(meta["credentials"]).resolve()
        require(path.is_file(), "a private fixture credential file is unavailable")
        credentials[path] = json.loads(path.read_text())

    private, characters = set(), set()
    for credential in credentials.values():
        require(set(credential) == {"account", "password", "secret", "character"}, "unexpected private fixture schema")
        for field, value in credential.items():
            require(isinstance(value, str) and bool(value), "invalid private fixture value")
            variants = {value.encode(), json.dumps(value, ensure_ascii=True)[1:-1].encode()}
            if field in ("password", "secret"):
                digest = hashlib.md5(value.encode()).hexdigest()
                variants.update((digest.encode(), digest.upper().encode(), base64.b64encode(value.encode())))
            (characters if field == "character" else private).update(variants)

    patterns = {
        "private_key": rb"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----",
        "aws_access_key": rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
        "github_token": rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b",
        "slack_token": rb"\bxox[baprs]-[A-Za-z0-9-]{24,}\b",
        "openai_key": rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b",
        "jwt": rb"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b",
    }
    patterns = {name: re.compile(pattern) for name, pattern in patterns.items()}
    counts, archives, hits = collections.Counter(), [], []

    def scan(data: bytes, path: str, scope: str, depth: int = 0) -> None:
        counts[scope + "_blobs"] += 1
        counts[scope + "_bytes"] += len(data)
        logical = path.rsplit("!", 1)[-1].replace("\\", "/")
        filename = PurePosixPath(logical)
        segments, basename = [p.lower() for p in filename.parts], filename.name.lower()
        sensitive = (
            "assets" in segments
            or bool(re.search(r"\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?$", basename))
            or basename in {"credentials.json", "config.local.yaml", "config.local.yml", "id_rsa", "id_ed25519", ".env"}
            or basename.startswith(".env.")
            or bool(re.fullmatch(r"(?:secret|secrets|credentials?|private[-_]?key)(?:\..+)?", basename))
            or basename.endswith((".key", ".p12", ".pfx"))
        )
        for kind, found in (
            ("sensitive_path", sensitive),
            ("unsafe_archive_path", filename.is_absolute() or ".." in filename.parts),
            ("private_credential_value", any(v in data for v in private)),
            ("private_character_identifier", any(v in data for v in characters)),
        ):
            if found:
                hits.append({"scope": scope, "path": path, "kind": kind})
        if b"\0" not in data[:8192]:
            for rule, pattern in patterns.items():
                if pattern.search(data):
                    hits.append({"scope": scope, "path": path, "kind": "common_secret_pattern", "rule": rule})
        if depth >= 2:
            return
        if path.lower().endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                members, regular = archive.infolist(), 0
                for member in members:
                    if member.is_dir():
                        continue
                    require(((member.external_attr >> 16) & 0o170000) != 0o120000, "ZIP symbolic link")
                    regular += 1
                    scan(archive.read(member), path + "!" + member.filename, scope + "-archive", depth + 1)
                archives.append({"scope": scope, "path": path, "format": "zip", "entries": len(members), "regular_files": regular})
        elif path.lower().endswith((".tar.gz", ".tgz")):
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
                members, regular = archive.getmembers(), 0
                for member in members:
                    require(member.isfile() or member.isdir(), "unsupported TAR entry type")
                    if not member.isfile():
                        continue
                    regular += 1
                    scan(archive.extractfile(member).read(), path + "!" + member.name, scope + "-archive", depth + 1)
                archives.append({"scope": scope, "path": path, "format": "tar.gz", "entries": len(members), "regular_files": regular})

    for path in staged:
        index, work = git("show", ":" + path), (ROOT / path).read_bytes()
        require(index == work, "index/worktree bytes differ: " + path)
        scan(index, path, "index")
        scan(work, path, "worktree")
    if hits:
        # Paths and rule names only; never print the matched bytes or a context line.
        print(json.dumps({"privacy_scan_passed": False, "hit_count": len(hits), "hits": hits}, ensure_ascii=False))
        raise RuntimeError("privacy audit found matching values, sensitive paths or token patterns")

    report={
        "checked_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope":"staged and matching working bytes, recursive ZIP/TAR members through two archive layers; private fixture values stay only in memory; no OCR",
        "staged_payload_files_scanned":len(staged),"worktree_payload_files_scanned":len(staged),
        "runtime_metadata_files_checked":len(metadata),"current_task_runtime_metadata_files_checked":len(current_metadata),
        "distinct_private_credential_files_read":len(credentials),"private_value_variants_checked":len(private),
        "private_character_variants_checked":len(characters),"sensitive_hits":0,"scan_counts":dict(counts),"archives":archives,
        "fixture_credential_values_absent":True,"runtime_db_and_credentials_not_in_report":True,
        "assets_tree_excluded":True,"stage_worktree_match":True,
    }
    if write_report:
        (OUT/"privacy-check.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    return {"passed":True,"files":len(staged),"sensitive_hits":0,"archive_count":len(archives)}

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--write-report",action="store_true");a=p.parse_args();print(json.dumps(audit(a.write_report)))
