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

    metadata = sorted(glob.glob("/tmp/sa-1114-0*-runtime*.json"))
    current_metadata = sorted(glob.glob(f"/tmp/{TASK}-runtime*.json"))
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

    release = json.loads((OUT / "release.json").read_text())
    elf = (ROOT / release["binary"]["path"]).read_bytes()
    packed = (ROOT / release["archive"]["archive"]).read_bytes()
    elf_sha, zip_sha = hashlib.sha256(elf).hexdigest(), hashlib.sha256(packed).hexdigest()
    require(elf_sha == release["binary"]["sha256"], "ELF/release digest mismatch")
    require(zip_sha == release["archive"]["sha256"], "ZIP/release digest mismatch")
    with zipfile.ZipFile(io.BytesIO(packed)) as archive:
        entries = len(archive.infolist())
        require(entries == release["archive"]["files"], "ZIP/release entry count mismatch")
        configs = [n for n in archive.namelist() if n.endswith("/config.yaml")]
        binaries = [n for n in archive.namelist() if n.endswith("/bin/saserver")]
        require(len(configs) == len(binaries) == 1, "unexpected release config or ELF membership")
        require(archive.read(configs[0]) == git("show", "HEAD:config.yaml"), "ZIP config differs from public HEAD template")
        require(archive.read(binaries[0]) == elf, "ZIP ELF bytes differ from bin/saserver")
    nested = [a for a in archives if a["scope"] == "index-archive" and a["format"] == "tar.gz"]
    standalone = [a for a in archives if a["scope"] == "index" and a["format"] == "tar.gz"]
    require(len(nested) == 4 and sum(a["regular_files"] for a in nested) == 26, "expected four nested patches with 26 files")
    require(len(standalone) == 1 and standalone[0]["regular_files"] == 7, "expected seven-file standalone new patch")

    browser = []
    for name, supervisor, expected in (("final-primal", "primal-browser", 20), ("final-mobile-regression", "mobile-regression", 14)):
        evidence = json.loads((OUT / "browser" / (name + ".json")).read_text())
        status = json.loads((OUT / (supervisor + "-status.json")).read_text())
        require(status["state"] == "finished" and status["exit_code"] == 0, "browser supervisor failed")
        require(len(evidence["checks"]) == expected and all(c["passed"] is True for c in evidence["checks"]), "browser check count or result mismatch")
        require(not evidence.get("failure") and evidence["errors"] == [], "browser reported errors")
        stop = evidence["shutdown"]
        require(stop["exit_code"] == 0 and stop["timed_out"] is False and stop["position_matches"] is True, "browser shutdown or persistence failed")
        require(evidence["binary_sha256"] == elf_sha and evidence["binary_version"] == release["version"], "browser/release ELF identity mismatch")
        browser.append({"file": "browser/" + name + ".json", "checks": expected, "all_passed": True, "errors": 0, "shutdown_exit_code": 0, "position_matches": True, "binary_sha256": elf_sha})
    require(sum(b["checks"] for b in browser) == release["checks"]["browser_checks"], "browser/release check claim mismatch")

    for path in staged:
        require(git("show", ":" + path) == (ROOT / path).read_bytes(), "payload changed during scan: " + path)
    require(not names("diff", "--name-only", "-z"), "unstaged files appeared during scan")
    require(not names("ls-files", "--others", "--exclude-standard", "-z"), "untracked files appeared during scan")
    result = {
        "fixture_credential_values_absent": True,
        "runtime_db_and_credentials_not_in_report": True,
        "checked_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope": "Added/modified staged blobs and matching worktree bytes, recursive ZIP/TAR regular members through two archive layers, and replacement privacy report. Private values remain in memory only.",
        "staged_change_entries_with_rename_detection": rename_count,
        "staged_change_entries_no_rename_detection": len(statuses) // 2,
        "staged_change_status_counts_no_rename_detection": dict(collections.Counter(statuses[::2])),
        "staged_payload_files_scanned": len(staged),
        "worktree_payload_files_scanned": len(staged),
        "unstaged_files_before_report_update": len(unstaged),
        "untracked_files": len(untracked),
        "runtime_metadata_files_checked": len(metadata),
        "current_task_runtime_metadata_files_checked": len(current_metadata),
        "distinct_private_credential_files_read": len(credentials),
        "private_value_variants_checked": len(private),
        "private_character_identifier_variants_checked": len(characters),
        "value_encodings_checked": ["UTF-8", "JSON ASCII escape", "password/secret MD5 hex in both cases", "password/secret base64"],
        "scan_counts": dict(counts),
        "archives": archives,
        "private_credential_value_hits": 0,
        "private_character_identifier_hits": 0,
        "common_secret_pattern_hits": 0,
        "sensitive_path_hits": 0,
        "unsafe_archive_path_hits": 0,
        "release_public_config_matches_HEAD_template": True,
        "release_zip_entries": entries,
        "release_zip_nested_patch_files": 26,
        "standalone_new_patch_files": 7,
        "release_zip_sha256": zip_sha,
        "release_elf_sha256": elf_sha,
        "final_browser_supervisors_finished_exit_zero": True,
        "reported_final_browser_checks": sum(b["checks"] for b in browser),
        "reported_final_client_and_builder_checks": release["checks"]["client_and_builder"],
        "browser_evidence": browser,
        "reproduction": "python3 Report/SA-1114-05/privacy-scan.py --write-report; first stage all public files including a placeholder privacy-check.json, freeze all writers, then stage only the resulting privacy report after success.",
        "limits": "Known private values are compared in all bytes including images, with no OCR. Common token regexes run on text-like blobs (no NUL in first 8192 bytes). This is bounded byte scanning, not a complete secret-detection guarantee. The replacement report is checked before writing and is the sole unstaged change afterward.",
    }
    output = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode()
    require(not any(v in output for v in private | characters), "replacement report contains a private fixture value")
    require(not any(pattern.search(output) for pattern in patterns.values()), "replacement report contains a token pattern")
    if write_report:
        (ROOT / REPORT).write_bytes(output)
        require(names("diff", "--name-only", "-z") == [REPORT], "unexpected worktree change after report write")
        require(not names("ls-files", "--others", "--exclude-standard", "-z"), "unexpected untracked files after report write")
        require(json.loads((ROOT / REPORT).read_text()) == result, "replacement report JSON parse mismatch")
        subprocess.run(["git", "diff", "--check", "--", REPORT], cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {
        "privacy_scan_passed": True,
        "report_written": write_report,
        "staged_change_entries": rename_count,
        "staged_payload_files": len(staged),
        "runtime_metadata_files": len(metadata),
        "credential_variants": len(private),
        "character_variants": len(characters),
        "all_sensitive_hits": 0,
        "zip_entries": entries,
        "nested_patch_files": 26,
        "standalone_new_patch_files": 7,
        "browser_checks": sum(b["checks"] for b in browser),
        "only_unstaged_file_after_write": REPORT if write_report else None,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true", help="Replace only this task's privacy-check.json after every check passes")
    args = parser.parse_args()
    print(json.dumps(audit(args.write_report), ensure_ascii=False, indent=2))
