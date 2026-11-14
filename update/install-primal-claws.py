#!/usr/bin/env python3
"""Validate and atomically install only the primal-claws-v2 asset extension."""
import argparse
import fcntl
import gzip
import hashlib
import json
import os
import re
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tarfile
import tempfile

PACKAGE_ID = "primal-claws-v2"
PREFIX = "extensions/" + PACKAGE_ID
ARCHIVE = PACKAGE_ID + "-assets.tar.gz"
CHECKSUMS = PACKAGE_ID + "-assets.manifest.json"
MAX_ARCHIVE = 100 * 1024 * 1024
MAX_UNPACKED = 100 * 1024 * 1024
EXPECTED = {PREFIX + "/manifest.json"}
EXPECTED.update(PREFIX + "/pages/%05d.png" % i for i in range(3))
EXPECTED.update(PREFIX + "/anim/%d.json" % i for i in (199400, 199401, 199402))


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(path):
    """Reject symlinks at every existing component, including the final one."""
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        require(not part.is_symlink(), "路径含符号链接，拒绝安装: " + str(part))
    return path


def strict_object(pairs):
    out = {}
    for key, value in pairs:
        require(key not in out, "JSON 含重复字段: " + key)
        out[key] = value
    return out


def regular_bytes(path, maximum):
    path = safe_path(path)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags), "rb") as source:
        info = os.fstat(source.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_size <= maximum,
                "文件类型或大小不合法: " + str(path))
        return source.read(maximum + 1)


def read_package(script_dir):
    raw = regular_bytes(script_dir / CHECKSUMS, 128 * 1024)
    manifest = json.loads(raw, object_pairs_hook=strict_object)
    require(isinstance(manifest, dict), "校验清单必须为JSON对象")
    require(manifest.get("schemaVersion") == 1 and manifest.get("packageId") == PACKAGE_ID,
            "不支持的校验清单版本或包名称")
    require(manifest.get("targetRoot") == "assets/" + PREFIX and manifest.get("installPrefix") == PREFIX,
            "目标目录合同不匹配")
    archive_meta = manifest.get("archive", {})
    require(isinstance(archive_meta, dict), "归档校验信息必须为对象")
    require(archive_meta.get("name") == ARCHIVE, "归档名称不匹配")
    entries = manifest.get("entries")
    require(isinstance(entries, list) and len(entries) == len(EXPECTED), "清单必须只包含指定的7个资源文件")
    expected = {}
    for entry in entries:
        require(isinstance(entry, dict), "无效的文件清单条目")
        name = entry.get("path")
        require(isinstance(name, str) and name in EXPECTED and name not in expected,
                "清单路径不在精确白名单内或有重复: " + str(name))
        require(isinstance(entry.get("size"), int) and not isinstance(entry.get("size"), bool)
                and 0 < entry["size"] <= MAX_UNPACKED, "无效的资源大小")
        checksum = entry.get("sha256")
        require(isinstance(checksum, str) and len(checksum) == 64
                and all(c in "0123456789abcdef" for c in checksum), "无效的SHA-256")
        expected[name] = entry
    require(set(expected) == EXPECTED, "文件清单不完整")
    require(sum(e["size"] for e in expected.values()) <= MAX_UNPACKED, "解压后总大小超过限制")
    archive = regular_bytes(script_dir / ARCHIVE, MAX_ARCHIVE)
    require(len(archive) == archive_meta.get("size"), "归档大小校验失败")
    require(digest(archive) == archive_meta.get("sha256"), "归档SHA-256校验失败")
    # Do not use extractall: validate the entire archive before creating files.
    import io
    # USTAR adds two EOF blocks before rounding to a full 10240-byte record.
    # Adding just one record can reject a valid archive near that boundary.
    member_bytes = sum(512 + ((e["size"] + 511) // 512) * 512 for e in expected.values())
    tar_limit = ((member_bytes + 1024 + 10239) // 10240) * 10240
    with gzip.GzipFile(fileobj=io.BytesIO(archive), mode="rb") as compressed:
        unpacked = compressed.read(tar_limit + 1)
    require(len(unpacked) <= tar_limit, "解压后的归档体积异常，拒绝读取")
    payloads = {}
    with tarfile.open(fileobj=io.BytesIO(unpacked), mode="r:", ignore_zeros=True) as package:
        for item in package:
            name = item.name
            path = PurePosixPath(name)
            require(not path.is_absolute() and ".." not in path.parts and "\\" not in name
                    and str(path) == name and name in expected and name not in payloads,
                    "归档包含非法、重复或越界路径: " + name)
            require(item.isreg() and not item.issym() and not item.islnk()
                    and not item.sparse and item.size == expected[name]["size"],
                    "归档包含非普通文件或大小不匹配: " + name)
            with package.extractfile(item) as source:
                data = source.read(expected[name]["size"] + 1)
            require(len(data) == expected[name]["size"] and digest(data) == expected[name]["sha256"],
                    "资源校验失败: " + name)
            payloads[name] = data
    require(set(payloads) == EXPECTED, "归档缺少资源文件")
    return manifest, expected, payloads


def verify_existing(destination, expected):
    actual = set()
    for base, dirs, files in os.walk(destination, followlinks=False):
        for name in dirs + files:
            item = Path(base) / name
            safe_path(item)
            require(item.is_dir() or item.is_file(), "现有扩展含非普通文件: " + str(item))
        for name in files:
            item = Path(base) / name
            key = PREFIX + "/" + item.relative_to(destination).as_posix()
            require(key in expected, "现有扩展含未知文件，保留现状并拒绝覆盖: " + key)
            data = regular_bytes(item, MAX_UNPACKED)
            require(len(data) == expected[key]["size"] and digest(data) == expected[key]["sha256"],
                    "现有扩展文件冲突，保留原文件并拒绝覆盖: " + key)
            actual.add(key)
    require(actual == EXPECTED, "现有扩展不完整，保留现状并拒绝覆盖；请人工检查该扩展目录")


def install(assets, expected, payloads):
    # Directory flock prevents two instances of this installer racing installation.
    lock = os.open(assets, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
        extensions = safe_path(assets / "extensions")
        require(not extensions.exists() or extensions.is_dir(), "extensions 必须是普通目录")
        destination = safe_path(extensions / PACKAGE_ID)
        if destination.exists():
            require(destination.is_dir(), "目标扩展不是目录，拒绝覆盖")
            verify_existing(destination, expected)
            print("已安装且7个文件校验一致，无需更改: " + str(destination))
            return
        extensions.mkdir(mode=0o755, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=".primal-claws-v2-stage-", dir=extensions))
        try:
            os.chmod(stage, 0o755)
            for name in sorted(payloads):
                target = stage / PurePosixPath(name).relative_to(PREFIX)
                target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                with target.open("xb") as output:
                    output.write(payloads[name])
                    output.flush()
                    os.fsync(output.fileno())
                os.chmod(target, 0o644)
            # Stage beside destination: a single directory rename publishes the
            # complete extension, never a partially copied manifest/pages pair.
            require(not destination.exists() and not destination.is_symlink(), "目标目录在安装期间发生变化")
            os.rename(stage, destination)
            parent_fd = os.open(extensions, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(parent_fd)
            finally:
                os.close(parent_fd)
            print("安装完成，7个文件校验通过: " + str(destination))
            print("v0.2.17客户端加载v2；原有素材和旧v1目录保持不变。")
            print("从v0.2.16升级须同时更新匹配bin/saserver，正常存档停服后重启并刷新网页；本脚本不停止服务。")
        finally:
            # Only remove this invocation's verified temporary staging directory.
            # Never delete or replace an existing installed extension/base asset.
            if stage.exists():
                require(stage.parent == extensions and stage.name.startswith(".primal-claws-v2-stage-")
                        and not stage.is_symlink(), "临时目录异常，拒绝清理")
                shutil.rmtree(stage)
    finally:
        os.close(lock)


def configured_assets(repo_root):
    """Recognize only a top-level scalar; uncertain YAML requires explicit target.

    This is a guard against installing into the default directory while the
    server uses an override, not a replacement for the server's YAML parser.
    """
    value = "assets"
    help_text = "配置assets不是可安全识别的普通标量，请核对配置后显式使用 --assets DIR"
    for filename in ("config.yaml", "config.local.yaml"):
        config = repo_root / filename
        if not config.exists():
            require(not config.is_symlink(), "配置路径是符号链接: " + str(config))
            continue
        text = regular_bytes(config, 1024 * 1024).decode("utf-8-sig")
        seen = False
        for line in text.splitlines():
            if not line or line[0].isspace() or line.lstrip().startswith("#"):
                continue
            require(not line.startswith(("{", "&", "!", "<<:", "?", "--- ")) and line.strip() not in ("---", "..."), help_text)
            match = re.match(r'^(?:assets|\'assets\'|"assets")\s*:\s*(.*)$', line)
            if not match:
                continue
            require(not seen, "配置中有重复assets字段，请显式指定 --assets DIR")
            seen = True
            raw = match.group(1).strip()
            if raw.startswith('"'):
                try:
                    scalar, end = json.JSONDecoder().raw_decode(raw)
                except ValueError:
                    raise ValueError(help_text)
                require(not raw[end:].strip() or raw[end:].lstrip().startswith("#"), help_text)
            elif raw.startswith("'"):
                quoted = re.fullmatch(r"'((?:[^']|'')*)'\s*(?:#.*)?", raw)
                require(quoted is not None, help_text)
                scalar = quoted.group(1).replace("''", "'")
            else:
                scalar = re.split(r'\s+#', raw, maxsplit=1)[0].strip()
                require(scalar and scalar[0] not in "&*!|>{[" and ": " not in scalar, help_text)
                require(scalar.lower() not in ("null", "~", "true", "false"), help_text)
            require(isinstance(scalar, str) and scalar and "\x00" not in scalar, help_text)
            value = scalar
    target = Path(value)
    return Path(os.path.abspath(target if target.is_absolute() else repo_root / target))


def main():
    parser = argparse.ArgumentParser(description="离线校验并安装萨鲁法斯／克劳德斯增量素材，保留原素材")
    parser.add_argument("--assets", metavar="DIR", help="显式指定已存在且末级名为assets/Assets的目录；默认脚本上级的assets")
    args = parser.parse_args()
    script_dir = safe_path(Path(__file__).absolute().parent)
    require(script_dir.name == "update", "安装器必须保留在update目录中")
    repo_root = script_dir.parent
    # Verify package before creating even the default empty Assets directory.
    _, expected, payloads = read_package(script_dir)
    assets = safe_path(args.assets if args.assets is not None else repo_root / "assets")
    require(assets.name.casefold() == "assets", "目标目录末级名称必须为assets或Assets（不区分大小写）")
    if args.assets is not None:
        require(assets.is_dir(), "--assets 必须指定已存在的目录")
    else:
        require(assets.parent == repo_root and (repo_root / "server").is_dir()
                and (repo_root / "client").is_dir() and (repo_root / "config.yaml").is_file(),
                "默认目标必须位于完整saserver仓库根目录下")
        configured = configured_assets(repo_root)
        require(configured == assets, "配置实际素材目录为 " + str(configured)
                + "；为防误装未修改默认assets，请核对后使用 --assets '" + str(configured) + "'")
        assets.mkdir(mode=0o755, exist_ok=True)
    require(assets.is_dir(), "目标assets不是目录")
    print("已验证离线素材包，目标目录: " + str(assets))
    install(assets, expected, payloads)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, tarfile.TarError, KeyError, TypeError, EOFError) as error:
        print("安装失败（未覆盖原素材）: " + str(error), file=sys.stderr)
        sys.exit(1)
