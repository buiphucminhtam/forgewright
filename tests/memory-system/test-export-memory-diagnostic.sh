#!/usr/bin/env bash
# test-export-memory-diagnostic.sh — Tests for export-memory-diagnostic.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/../..")"
EXPORT_SCRIPT="$FORGEWRIGHT_DIR/scripts/export-memory-diagnostic.sh"

PASS=0
FAIL=0
TESTS=0

pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

echo ""
echo "━━━ test-export-memory-diagnostic.sh ━━━"

tmp_workspace="$(mktemp -d)"
tmp_out="$(mktemp -d)"
trap 'rm -rf "$tmp_workspace" "$tmp_out"' EXIT

mkdir -p "$tmp_workspace/.forgewright/memory-bank/scenarios"
mkdir -p "$tmp_workspace/.forgewright/offload/session-a/refs"
mkdir -p "$tmp_workspace/.forgewright/audit"
mkdir -p "$tmp_workspace/.forgewright/subagent-context"

cat > "$tmp_workspace/.forgewright/memory-bank/persona.md" <<'EOF'
# Persona

API key: sk-1234567890abcdefghijklmnop
EOF

cat > "$tmp_workspace/.forgewright/memory-bank/scenarios/scenario-a.md" <<'EOF'
# Scenario

password=supersecret
EOF

cat > "$tmp_workspace/.forgewright/offload/session-a/events.jsonl" <<'EOF'
{"node_id":"n1","token":"mytoken123456","summary":"event secret=hiddenvalue"}
EOF

cat > "$tmp_workspace/.forgewright/offload/session-a/state.json" <<'EOF'
{"session_id":"session-a","credential":"credential-secret"}
EOF

cat > "$tmp_workspace/.forgewright/offload/session-a/canvas.mmd" <<'EOF'
flowchart TD
  n1["done"]
EOF

cat > "$tmp_workspace/.forgewright/offload/session-a/refs/n1.md" <<'EOF'
raw ref contains token=rawsecrettoken
EOF

cat > "$tmp_workspace/.forgewright/audit/audit.jsonl" <<'EOF'
{"args":{"password":"auditpass"},"summary":"Bearer eyJhbGciOiJIUzI1NiJ9abcdef"}
EOF

cat > "$tmp_workspace/.forgewright/settings.env" <<'EOF'
API_TOKEN=settingssecret
EOF

cat > "$tmp_workspace/.forgewright/session-log.json" <<'EOF'
{"sessions":[{"status":"completed","secret":"sessionsecret"}]}
EOF

# ── T1: Script creates archive with expected safe contents ───────────────
echo ""
echo "T1: Export creates archive with metadata and excludes raw refs by default"
((TESTS++))
archive=$(FORGEWRIGHT_WORKSPACE="$tmp_workspace" bash "$EXPORT_SCRIPT" "$tmp_out")
if [[ -f "$archive" ]]; then
    python3 - "$archive" <<'PY'
import sys, tarfile
archive = sys.argv[1]
with tarfile.open(archive, "r:gz") as tar:
    names = set(tar.getnames())
required = {
    "manifest.json",
    "memory/sqlite-stats.json",
    "memory-bank/persona.md",
    "memory-bank/scenarios/scenario-a.md",
    "offload/session-a/events.jsonl",
    "offload/session-a/state.json",
    "offload/session-a/canvas.mmd",
    "offload/sessions.json",
    "audit/audit.jsonl",
    "config/settings.env.redacted",
    "session/session-log.json",
}
missing = required - names
assert not missing, f"missing: {missing}"
assert "offload/session-a/refs/n1.md" not in names
PY
    if [[ "$?" -eq 0 ]]; then
        pass "Archive contains expected metadata and excludes raw refs"
    else
        fail "Archive contents were incorrect"
    fi
else
    fail "Archive was not created"
fi

# ── T2: Export redacts sensitive values ──────────────────────────────────
echo ""
echo "T2: Export redacts sensitive values"
((TESTS++))
if python3 - "$archive" <<'PY'
import sys, tarfile
archive = sys.argv[1]
combined = ""
with tarfile.open(archive, "r:gz") as tar:
    for member in tar.getmembers():
        if member.isfile():
            extracted = tar.extractfile(member)
            if extracted:
                combined += extracted.read().decode("utf-8", errors="replace")
for secret in [
    "sk-1234567890abcdefghijklmnop",
    "supersecret",
    "mytoken123456",
    "hiddenvalue",
    "credential-secret",
    "auditpass",
    "settingssecret",
    "sessionsecret",
]:
    assert secret not in combined, secret
assert "[REDACTED]" in combined
PY
then
    pass "Sensitive values redacted"
else
    fail "Sensitive values leaked"
fi

# ── T3: --include-raw includes raw refs only after redaction ─────────────
echo ""
echo "T3: --include-raw includes raw refs after redaction"
((TESTS++))
archive_raw=$(FORGEWRIGHT_WORKSPACE="$tmp_workspace" bash "$EXPORT_SCRIPT" "$tmp_out" --include-raw)
if python3 - "$archive_raw" <<'PY'
import sys, tarfile
archive = sys.argv[1]
with tarfile.open(archive, "r:gz") as tar:
    names = set(tar.getnames())
    assert "offload/session-a/refs/n1.md" in names
    text = tar.extractfile("offload/session-a/refs/n1.md").read().decode()
assert "rawsecrettoken" not in text
assert "[REDACTED]" in text
PY
then
    pass "Raw refs included and redacted with --include-raw"
else
    fail "Raw ref include/redaction failed"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
[[ "$FAIL" -eq 0 ]]
