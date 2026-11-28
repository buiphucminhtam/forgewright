#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# runtime-install.sh — Global installer for the Runtime Lifecycle Guard
# Plan: docs/adr/ADR-010-runtime-lifecycle-guard.md  (P0.5 — INSTALL, §G2)
#
# WHY THIS EXISTS
#   ~/.forgewright/scripts/ is populated by COPY, and it has already drifted
#   from the repo (cleanup.sh: global May 18 vs repo Jul 9). A copied reaper
#   would mean the script holding kill authority does not match the source
#   anyone reviews. RLG prefers native symlinks and verifies by checksum.
#   Windows without symlink privilege uses explicit copy-native records;
#   verification binds both installed bytes and current source to that checksum.
#
#   This is the ONE place in the whole design that is fail-CLOSED: if the
#   install cannot be verified, the guard must refuse to run rather than
#   execute code of unknown provenance. Everything else fails open.
#
# Usage:
#   runtime-install.sh --link      [--from REPO] [--target DIR]
#   runtime-install.sh --verify    [--quiet]
#   runtime-install.sh --status
#   runtime-install.sh --uninstall
#
# Exit codes: 0 ok · 1 problem (broken/drifted/not installed) · 2 usage
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=scripts/runtime/runtime-common.sh
. "${SCRIPT_DIR}/runtime-common.sh"

# Files that make up the guard. Append-only lists.
#   RLG_FILES      — sourced from scripts/runtime/
#   RLG_LITE_FILES — sourced from scripts/lite/ (hooks live there by repo
#                    convention, alongside stop-gate.sh / verify-gate.sh)
# Both are installed into the same install dir so the manifest covers every
# file that can execute with the guard's authority.
RLG_FILES="runtime-common.sh runtime_registry.py runtime-lease.sh runtime-inventory.sh runtime-install.sh runtime-hooks-install.sh runtime-reap.sh runtime-sweep.sh disk-budget.sh project_disk.py project_storage.py artifact_pins.py runtime-gc.sh port-broker.sh dev-run.sh rlg_spawn.py windows_project_storage.py windows_security.py"
RLG_LITE_FILES="runtime-pretool-gate.sh windows_secure_io.py"

DEFAULT_TARGET="$HOME/.forgewright/scripts/runtime"

ACTION=""
FROM_REPO=""
TARGET="${FORGEWRIGHT_RLG_TARGET:-$DEFAULT_TARGET}"
QUIET=0

RLG_WINDOWS=0
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) RLG_WINDOWS=1 ;; esac

# Native Python cannot interpret Git Bash /c/... paths. Store native forward-
# slash paths in Windows records; shell tools accept these without CRLF output.
python_path() {
  if [ "$RLG_WINDOWS" -eq 1 ]; then cygpath -am "$1" | tr -d '\r'; else printf '%s' "$1"; fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --link)      ACTION="link";      shift ;;
    --verify)    ACTION="verify";    shift ;;
    --status)    ACTION="status";    shift ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --from)      FROM_REPO="${2:-}"; shift 2 ;;
    --target)    TARGET="${2:-}";    shift 2 ;;
    --quiet)     QUIET=1; shift ;;
    --help|-h)   sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) rlg_err "unknown arg: $1"; exit 2 ;;
  esac
done
[ -n "$ACTION" ] || { sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }

say() { [ "$QUIET" -eq 1 ] || echo -e "$*"; }

# repo_src_dir — where the canonical scripts live.
repo_src_dir() {
  if [ -n "$FROM_REPO" ]; then
    printf '%s/scripts/runtime' "$(cd "$FROM_REPO" 2>/dev/null && pwd -P)"
  else
    printf '%s' "$SCRIPT_DIR"
  fi
}

repo_root_of() {
  local src="$1"
  (cd "$src/../.." 2>/dev/null && pwd -P) || printf '%s' "$src"
}

git_sha_of() {
  local root="$1"
  (cd "$root" 2>/dev/null && git rev-parse --short HEAD 2>/dev/null) || printf 'NOGIT'
}

# ── seed the allowlist from whatever is already running (plan §G7) ───────────
# Everything listening at install time predates the guard, therefore it is
# infrastructure and must never be touched. This is the safety floor for P2.
seed_allowlist() {
  local f; f="$(rlg_allowlist)"
  if [ -s "$f" ]; then
    say "  allowlist: kept (already has $(rlg_count_entries "$f") entries)"
    return 0
  fi
  command -v lsof >/dev/null 2>&1 || { say "  allowlist: lsof unavailable, left empty"; return 0; }

  {
    echo "# RLG port allowlist — ports here are NEVER reaped."
    echo "# Seeded at install from processes already listening on $(rlg_now_utc)."
    echo "# Format: <port>   # <comment>"
    lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '
      {
        # The last field is "(LISTEN)", not the address — scan backwards for
        # the first field that actually looks like host:port.
        port = ""
        for (i = NF; i >= 1; i--) {
          if ($i ~ /:[0-9]+$/) { n = split($i, parts, ":"); port = parts[n]; break }
        }
        if (port ~ /^[0-9]+$/ && !(port in seen)) { seen[port] = $1 }
      }
      END { for (p in seen) printf "%s\t# %s (pre-existing at install)\n", p, seen[p] }
    ' | sort -n
  } > "$f"
  say "  allowlist: seeded $(rlg_count_entries "$f") pre-existing port(s)"
}

# ── link ─────────────────────────────────────────────────────────────────────
do_link() {
  local src root sha
  src="$(repo_src_dir)"
  [ -d "$src" ] || { rlg_err "source dir not found: $src"; return 1; }
  root="$(repo_root_of "$src")"
  sha="$(git_sha_of "$root")"

  say "${RLG_BLUE}Installing Runtime Lifecycle Guard${RLG_NC}"
  say "  source: $src ($sha)"
  say "  target: $TARGET"

  rlg_init_dirs || { rlg_err "cannot initialise $(rlg_home)"; return 1; }
  mkdir -p "$TARGET" || { rlg_err "cannot create $TARGET"; return 1; }
  TARGET="$(cd "$TARGET" && pwd -P)" || return 1

  local lite_src="$root/scripts/lite"
  local entries="" missing=0 f s h mode

  link_one() { # <source_dir> <filename>
    s="$1/$2"
    if [ ! -r "$s" ]; then rlg_err "missing source file: $s"; missing=1; return 1; fi
    mode="symlink"
    if MSYS=winsymlinks:nativestrict ln -sfn "$s" "$TARGET/$2"; then
      # MSYS's default ln may silently copy. Success without a link is never
      # evidence of symlink provenance, even on Windows.
      [ -L "$TARGET/$2" ] || { rlg_err "silent copy instead of symlink: $2"; missing=1; return 1; }
    elif [ "$RLG_WINDOWS" -eq 1 ]; then
      # Replace rather than write through an existing link/hardlink. No hardlinks
      # are created. Verification still rejects reparse ancestors and drift.
      python3 - "$(python_path "$s")" "$(python_path "$TARGET/$2")" <<'PY'
import os, pathlib, stat, sys, tempfile
source, target = map(pathlib.Path, sys.argv[1:])
for path in (source, target.parent):
    for component in (path, *path.parents):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("reparse source/target path")
info = source.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
    raise ValueError("source must be a single-link regular file")
fd, temporary = tempfile.mkstemp(prefix=".rlg-", dir=target.parent)
try:
    with os.fdopen(fd, "wb") as output:
        output.write(source.read_bytes())
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, target)
finally:
    if os.path.lexists(temporary):
        os.unlink(temporary)
PY
      [ "$?" -eq 0 ] || { rlg_err "cannot copy-native $2"; missing=1; return 1; }
      mode="copy-native"
    else
      rlg_err "cannot symlink $2"; missing=1; return 1
    fi
    h="$(rlg_sha256 "$s")"
    # src_dir is recorded per file: the hook comes from scripts/lite/ while the
    # rest come from scripts/runtime/, and verify must know which is which or a
    # file could be swapped for one from another directory undetected.
    entries="${entries}${entries:+,}{\"name\":\"$2\",\"src_dir\":\"$(rlg_json_escape "$(python_path "$1")")\",\"sha256\":\"$h\",\"link_mode\":\"$mode\"}"
    say "  ${RLG_GREEN}$mode${RLG_NC} $2"
    return 0
  }

  for f in $RLG_FILES;      do link_one "$src" "$f"; done
  for f in $RLG_LITE_FILES; do link_one "$lite_src" "$f"; done
  [ "$missing" -eq 0 ] || { rlg_err "install incomplete"; return 1; }

  printf '{"schema_version":"1","repo":"%s","src":"%s","git_sha":"%s","installed_at":"%s","target":"%s","files":[%s]}\n' \
    "$(rlg_json_escape "$(python_path "$root")")" "$(rlg_json_escape "$(python_path "$src")")" "$sha" \
    "$(rlg_now_utc)" "$(rlg_json_escape "$(python_path "$TARGET")")" "$entries" \
    > "$(rlg_install_file)" || { rlg_err "cannot write $(rlg_install_file)"; return 1; }

  do_verify || return 1
  seed_allowlist
  say "  mode: $(rlg_mode) ${RLG_DIM}(observe = report only, nothing is killed)${RLG_NC}"
  rlg_ok "installed — verify with: bash $TARGET/runtime-install.sh --verify"
  return 0
}

# ── verify (FAIL-CLOSED) ─────────────────────────────────────────────────────
do_verify() {
  local rec; rec="$(rlg_install_file)"
  if [ ! -r "$rec" ]; then
    say "${RLG_RED}NOT INSTALLED${RLG_NC} — no $rec"
    return 1
  fi
  python3 - "$(python_path "$rec")" "$RLG_FILES" "$RLG_LITE_FILES" "$QUIET" <<'PY'
# BEGIN RLG VERIFY PYTHON
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


def native_path(value):
    if not isinstance(value, str) or not value or any(c in value for c in "\r\n\t\0"):
        raise ValueError("CORRUPT path")
    # Compatibility with old Git Bash records; never use a shell to convert.
    if os.name == "nt" and value.startswith("/") and not value.startswith("//"):
        value = subprocess.check_output(["cygpath", "-am", value], text=True).strip()
    path = Path(value)
    if not path.is_absolute():
        raise ValueError("CORRUPT relative path")
    return Path(os.path.abspath(path))


def no_redirects(path):
    for component in (path, *path.parents):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("BROKEN reparse/symlink path: " + str(component))


def regular_copy(path):
    no_redirects(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError("BROKEN copy-native requires single-link regular file: " + str(path))


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            result.update(chunk)
    return result.hexdigest()


def verify_record(data, runtime_names, lite_names, *, platform=os.name):
    if not isinstance(data, dict) or data.get("schema_version") != "1":
        raise ValueError("CORRUPT install record")
    entries = data.get("files")
    if not isinstance(entries, list) or not entries:
        raise ValueError("EMPTY manifest lists no files")
    root, src, target = (native_path(data[key]) for key in ("repo", "src", "target"))
    if src != root / "scripts/runtime":
        raise ValueError("FOREIGN runtime source directory")
    expected = {name: root / "scripts/runtime" for name in runtime_names}
    expected.update({name: root / "scripts/lite" for name in lite_names})
    names = []
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("name") not in expected:
            raise ValueError("FOREIGN unknown manifest entry")
        names.append(entry["name"])
    if len(names) != len(set(names)) or set(names) != set(expected):
        raise ValueError("CORRUPT incomplete or duplicate manifest")
    no_redirects(target)
    extras = set(os.listdir(target)) - set(expected)
    if extras:
        raise ValueError("EXTRA unmanaged files: " + ", ".join(sorted(extras)))
    for entry in entries:
        name = entry["name"]
        mode = entry.get("link_mode", "symlink")
        if mode not in {"symlink", "copy-native"}:
            raise ValueError("BROKEN unknown link_mode: " + str(mode))
        if mode == "copy-native" and platform != "nt":
            raise ValueError("BROKEN copy-native is Windows-only")
        source_dir = native_path(entry.get("src_dir", data["src"]))
        if source_dir != expected[name]:
            raise ValueError("FOREIGN source directory: " + name)
        no_redirects(source_dir)
        source, installed = source_dir / name, target / name
        want = entry.get("sha256")
        if not isinstance(want, str) or not re.fullmatch(r"[0-9a-f]{64}", want):
            raise ValueError("CORRUPT checksum: " + name)
        if mode == "symlink":
            if not installed.is_symlink():
                raise ValueError("BROKEN not a symlink: " + name)
            # Normalize only path spelling, not the target via resolve(): a
            # foreign intermediate symlink is not an exact source binding.
            actual = os.readlink(installed)
            if os.name == "nt" and actual.startswith("\\\\?\\"):
                actual = actual[4:]
            if native_path(actual) != source:
                raise ValueError("FOREIGN symlink target: " + name)
        else:
            regular_copy(installed)
            regular_copy(source)
        if not source.is_file() or not installed.is_file():
            raise ValueError("BROKEN missing or non-regular file: " + name)
        if digest(installed) != want or digest(source) != want:
            raise ValueError("DRIFT installed or source bytes changed: " + name)
    return len(entries)


if __name__ == "__main__":
    quiet = sys.argv[4] == "1"
    try:
        with open(sys.argv[1], encoding="utf-8") as stream:
            data = json.load(stream)
        checked = verify_record(data, sys.argv[2].split(), sys.argv[3].split())
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        if not quiet:
            print("verify FAILED — " + str(error) + ". Guard must not run.")
        sys.exit(1)
    if not quiet:
        print(f"verify PASSED — {checked} files match source")
# END RLG VERIFY PYTHON
PY
}

# ── status ───────────────────────────────────────────────────────────────────
do_status() {
  local state="active"; rlg_enabled || state="DISABLED"
  echo "${RLG_BLUE}Runtime Lifecycle Guard — status${RLG_NC}"
  echo "  home:      $(rlg_home)"
  echo "  guard:     $state"
  echo "  mode:      $(rlg_mode)"
  echo "  installed: $([ -r "$(rlg_install_file)" ] && echo yes || echo no)"
  if [ -r "$(rlg_install_file)" ]; then
    echo "  from:      $(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["repo"],d["git_sha"])' "$(rlg_install_file)" 2>/dev/null)"
    echo "  at:        $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["installed_at"])' "$(rlg_install_file)" 2>/dev/null)"
  fi
  echo "  allowlist: $(rlg_count_entries "$(rlg_allowlist)") port(s)"
  echo "  projects:  $(rlg_count_entries "$(rlg_projects_index)") project(s)"
  echo
  bash "${SCRIPT_DIR}/runtime-lease.sh" status 2>/dev/null
  echo
  echo "${RLG_DIM}kill-switch: FORGEWRIGHT_RLG=off · touch $(rlg_disabled_file) · <project>/.forgewright/rlg-optout${RLG_NC}"
  return 0
}

# ── uninstall ────────────────────────────────────────────────────────────────
do_uninstall() {
  local rec; rec="$(rlg_install_file)"
  local target="$TARGET"
  [ -r "$rec" ] && target="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["target"])' "$rec" 2>/dev/null || printf '%s' "$TARGET")"

  for f in $RLG_FILES $RLG_LITE_FILES; do
    [ -L "$target/$f" ] && rm -f "$target/$f" && say "  unlink $f"
  done
  rmdir "$target" 2>/dev/null || true
  rm -f "$rec"
  rlg_ok "uninstalled symlinks — state under $(rlg_home) left untouched"
  return 0
}

case "$ACTION" in
  link)      do_link ;;
  verify)    do_verify ;;
  status)    do_status ;;
  uninstall) do_uninstall ;;
esac
