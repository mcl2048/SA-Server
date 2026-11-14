#!/usr/bin/env bash
# Offline Linux installer. All paths resolve from this script, not the caller's cwd.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
command -v python3 >/dev/null 2>&1 || { echo '需要 Python 3.9+，本脚本不会安装软件或访问网络。' >&2; exit 1; }
exec python3 "$SCRIPT_DIR/install-lisarido.py" "$@"
