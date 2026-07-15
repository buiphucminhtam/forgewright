#!/usr/bin/env bash
# Focused regression tests for safe MCP launcher argv handling.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
LAUNCHER="$ROOT_DIR/scripts/forgewright-mcp-launcher.sh"
MCP_LAUNCHER="$ROOT_DIR/scripts/mcp/forgewright-mcp-launcher.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/forgewright-launcher.XXXXXX")"
TEST_HOME="$TEST_ROOT/home"
CANONICAL_SERVER="$TEST_HOME/.forgewright/mcp-server/src/index.ts"
CANONICAL_TSX="$TEST_HOME/.forgewright/mcp-server/node_modules/.bin/tsx"
FAKE_NPX_OUTPUT="$TEST_ROOT/npx-argv"
PASS=0
FAIL=0

cleanup() {
    rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

pass() {
    PASS=$((PASS + 1))
    printf 'PASS: %s\n' "$1"
}

fail() {
    FAIL=$((FAIL + 1))
    printf 'FAIL: %s\n' "$1" >&2
}

assert_argv() {
    local expected_path="$1"
    local first_argument argument_count

    first_argument="$(sed -n '1p' "$FAKE_NPX_OUTPUT")"
    argument_count="$(wc -l < "$FAKE_NPX_OUTPUT" | tr -d '[:space:]')"
    if [[ "$argument_count" == "1" ]] && [[ "$first_argument" == "$expected_path" ]]; then
        pass "launcher executes canonical tsx with an exact server argv"
    else
        fail "launcher argv was not preserved exactly"
        printf '  actual argv: %q\n' "$first_argument" >&2
    fi
}

write_manifest() {
    local workspace="$1"
    local command="$2"

    mkdir -p "$workspace/.antigravity"
    node - "$workspace/.antigravity/mcp-manifest.json" "$workspace" "$command" <<'NODE'
const fs = require('fs');
const [manifestPath, workspace, command] = process.argv.slice(2);
fs.writeFileSync(manifestPath, JSON.stringify({
  workspace,
  servers: [{
    name: 'forgewright',
    type: 'forgewright-mcp-server',
    command,
    enabled: true,
    auto_start: true,
  }],
}));
NODE
}

write_path_manifest() {
    local workspace="$1"
    local server_path="$2"

    mkdir -p "$workspace/.antigravity"
    node - "$workspace/.antigravity/mcp-manifest.json" "$workspace" "$server_path" <<'NODE'
const fs = require('fs');
const [manifestPath, workspace, serverPath] = process.argv.slice(2);
fs.writeFileSync(manifestPath, JSON.stringify({
  manifest_version: '1.0',
  workspace,
  servers: [{
    name: 'forgewright',
    type: 'forgewright-mcp-server',
    path: serverPath,
    enabled: true,
    auto_start: true,
  }],
}));
NODE
}

run_launcher() {
    local workspace="$1"
    rm -f "$FAKE_NPX_OUTPUT"
    HOME="$TEST_HOME" FORGEWRIGHT_DEBUG=1 FORGEWRIGHT_WORKSPACE="$workspace" FAKE_NPX_OUTPUT="$FAKE_NPX_OUTPUT" bash "$LAUNCHER" >/dev/null 2>"$TEST_ROOT/stderr"
}

mkdir -p "$(dirname "$CANONICAL_SERVER")" "$(dirname "$CANONICAL_TSX")"
touch "$CANONICAL_SERVER"
cat > "$CANONICAL_TSX" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FAKE_NPX_OUTPUT"
SH
chmod +x "$CANONICAL_TSX"

valid_workspace="$TEST_ROOT/valid workspace's quote"
valid_server="$CANONICAL_SERVER"
mkdir -p "$valid_workspace"
valid_server_resolved="$(cd "$(dirname "$valid_server")" && pwd -P)/$(basename "$valid_server")"
write_manifest "$valid_workspace" "npx tsx $valid_server"
if run_launcher "$valid_workspace"; then
    assert_argv "$valid_server_resolved"
else
    fail "valid manifest command should launch"
fi

path_workspace="$TEST_ROOT/setup manifest"
path_server="$CANONICAL_SERVER"
mkdir -p "$path_workspace"
path_server_resolved="$(cd "$(dirname "$path_server")" && pwd -P)/$(basename "$path_server")"
write_path_manifest "$path_workspace" "$path_server"
if run_launcher "$path_workspace"; then
    assert_argv "$path_server_resolved"
else
    fail "setup-generated path manifest should launch"
fi

malicious_workspace="$TEST_ROOT/malicious"
malicious_server="$malicious_workspace/server.ts"
marker="$TEST_ROOT/command-injection-marker"
mkdir -p "$malicious_workspace"
touch "$malicious_server"
write_manifest "$malicious_workspace" "npx tsx $CANONICAL_SERVER; touch $marker"
if ! run_launcher "$malicious_workspace" && [[ ! -e "$marker" ]]; then
    if grep -Fq 'Rejected unsafe or unsupported MCP server command' "$TEST_ROOT/stderr"; then
        pass "malicious manifest path is rejected without shell execution"
    else
        fail "malicious manifest path was not reported as rejected"
    fi
else
    fail "malicious manifest path executed or was accepted"
fi

arbitrary_workspace="$TEST_ROOT/arbitrary-path"
arbitrary_server="$arbitrary_workspace/server.ts"
mkdir -p "$arbitrary_workspace"
touch "$arbitrary_server"
write_path_manifest "$arbitrary_workspace" "$arbitrary_server"
if ! run_launcher "$arbitrary_workspace"; then
    pass "workspace-owned server path is rejected"
else
    fail "workspace-owned server path was executed"
fi

if grep -Eq '^[[:space:]]*(eval|bash[[:space:]]+-c|sh[[:space:]]+-c)[[:space:]]' "$LAUNCHER"; then
    fail "launcher still contains string command execution"
else
    pass "launcher contains no string command execution"
fi

if cmp -s "$LAUNCHER" "$MCP_LAUNCHER"; then
    pass "root and MCP launcher copies remain synchronized"
else
    fail "root and MCP launcher copies diverged"
fi

printf '\nResults: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]]
