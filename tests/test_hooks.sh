#!/usr/bin/env bash
set -euo pipefail

echo "Running temp-HOME hook tests..."

TEMP_HOME=$(mktemp -d)
export HOME="$TEMP_HOME"
export FORGEWRIGHT_DIR="$HOME/.forgewright"

echo "Test 1: Install hooks"
bash scripts/forgewright-install.sh --profile minimal --yes --skip-mcp --skip-skills --skip-config
if [[ ! -f "$HOME/.gemini/settings.json" ]]; then
    echo "FAILED: Gemini settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.claude/settings.json" ]]; then
    echo "FAILED: Claude settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.cursor/hooks.json" ]]; then
    echo "FAILED: Cursor settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.codex/config.toml" ]]; then
    echo "FAILED: Codex settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.gemini/config/hooks.json" ]]; then
    echo "FAILED: Antigravity hook registry not installed"
    exit 1
fi
if [[ ! -x "$FORGEWRIGHT_DIR/scripts/lite/stop-gate.sh" ]]; then
    echo "FAILED: Stop gate runtime was not installed"
    exit 1
fi
if [[ ! -x "$FORGEWRIGHT_DIR/scripts/lite/gemini-before-tool-gate.sh" ]]; then
    echo "FAILED: Gemini BeforeTool gate runtime was not installed"
    exit 1
fi
if [[ ! -x "$FORGEWRIGHT_DIR/scripts/lite/antigravity-pre-tool-gate.sh" ]]; then
    echo "FAILED: Antigravity PreToolUse gate runtime was not installed"
    exit 1
fi

echo "Test 2: Validate hook schemas"
claude_schema=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.claude/settings.json')); console.log(!('stop' in c.hooks) && Array.isArray(c.hooks.Stop) && c.hooks.Stop.some(g => Array.isArray(g.hooks) && g.hooks.some(h => h.type === 'command' && h.command.includes('stop-gate.sh --platform CLAUDE'))));")
if [[ "$claude_schema" != "true" ]]; then
    echo "FAILED: Claude Stop must be a matcher-group array; lowercase/string stop is invalid"
    exit 1
fi

is_array=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/settings.json')); console.log(Array.isArray(c.hooks.AfterAgent));")
if [[ "$is_array" != "true" ]]; then
    echo "FAILED: Gemini AfterAgent must be an array"
    exit 1
fi

if ! grep -q -e "stop-gate.sh --platform GEMINI" "$HOME/.gemini/settings.json"; then
    echo "FAILED: Gemini missing platform arg"
    exit 1
fi
gemini_before_schema=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/settings.json')); console.log(Array.isArray(c.hooks.BeforeTool) && c.hooks.BeforeTool.some(g => g.matcher === '*' && Array.isArray(g.hooks) && g.hooks.some(h => h.name === 'forgewright-policy' && h.type === 'command' && h.command.includes('gemini-before-tool-gate.sh') && typeof h.timeout === 'number')));")
if [[ "$gemini_before_schema" != "true" ]]; then
    echo "FAILED: Gemini BeforeTool policy hook schema is invalid"
    exit 1
fi
antigravity_schema=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/config/hooks.json')); var n=c['forgewright-policy']; console.log(Boolean(n && Array.isArray(n.PreToolUse) && n.PreToolUse.some(g => g.matcher === '*' && Array.isArray(g.hooks) && g.hooks.some(h => h.type === 'command' && h.command.includes('antigravity-pre-tool-gate.sh') && Number.isInteger(h.timeout) && h.timeout > 0))));")
if [[ "$antigravity_schema" != "true" ]]; then
    echo "FAILED: Antigravity PreToolUse named-hook schema is invalid"
    exit 1
fi
if ! grep -q -e "stop-gate.sh --platform CLAUDE" "$HOME/.claude/settings.json"; then
    echo "FAILED: Claude missing platform arg"
    exit 1
fi

cursor_schema=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.cursor/hooks.json')); console.log(c.version === 1 && Array.isArray(c.hooks.stop) && c.hooks.stop.some(h => typeof h.command === 'string' && h.command.includes('stop-gate.sh --platform CURSOR')));")
if [[ "$cursor_schema" != "true" ]]; then
    echo "FAILED: Cursor hooks must use version 1 with a stop array"
    exit 1
fi

echo "Test 2a: Installer migrates legacy verify-gate hooks without duplicates"
node -e "var fs=require('fs'); var c=JSON.parse(fs.readFileSync('$HOME/.claude/settings.json')); c.hooks.Stop=[{hooks:[{type:'command',command:'bash legacy/verify-gate.sh --platform CLAUDE'}]}]; fs.writeFileSync('$HOME/.claude/settings.json', JSON.stringify(c, null, 2));"
node -e "var fs=require('fs'); var c=JSON.parse(fs.readFileSync('$HOME/.gemini/settings.json')); c.hooks.AfterAgent=[{matcher:'*',hooks:[{type:'command',command:'bash legacy/verify-gate.sh --platform GEMINI'}]}]; fs.writeFileSync('$HOME/.gemini/settings.json', JSON.stringify(c, null, 2));"
node -e "var fs=require('fs'); var c=JSON.parse(fs.readFileSync('$HOME/.cursor/hooks.json')); c.hooks.stop=[{command:'bash legacy/verify-gate.sh --platform CURSOR'}]; fs.writeFileSync('$HOME/.cursor/hooks.json', JSON.stringify(c, null, 2));"
printf 'approval_policy = "never"\n[features]\nhooks = true\n[hooks]\n\n[[hooks.Stop]]\nmatcher = "*"\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "bash legacy/verify-gate.sh --platform CODEX"\n' > "$HOME/.codex/config.toml"
node -e "var fs=require('fs'); var p='$HOME/.gemini/config/hooks.json'; var c=JSON.parse(fs.readFileSync(p)); c['another-hook']={Stop:[{command:'echo keep'}]}; fs.writeFileSync(p, JSON.stringify(c, null, 2));"
bash scripts/forgewright-install.sh --profile minimal --yes --skip-mcp --skip-skills --skip-config >/dev/null 2>&1
if grep -R -q "verify-gate.sh --platform" "$HOME/.claude/settings.json" "$HOME/.gemini/settings.json" "$HOME/.cursor/hooks.json" "$HOME/.codex/config.toml"; then
    echo "FAILED: Installer retained a legacy direct verify-gate hook"
    exit 1
fi
if ! node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/config/hooks.json')); process.exit(c['another-hook'] ? 0 : 1);"; then
    echo "FAILED: Installer destroyed an unrelated Antigravity named hook"
    exit 1
fi

echo "Test 3: Run Doctor"
export FORGEWRIGHT_HOOK_PROFILE="minimal"
doctor_output=$(bash scripts/forgewright-hook-doctor.sh --quick 2>&1 || true)
if ! grep -q "Claude Stop hook uses the native matcher-group schema" <<< "$doctor_output" || \
   ! grep -q "Cursor stop hook uses the version 1 array schema" <<< "$doctor_output" || \
   ! grep -q "Gemini BeforeTool and AfterAgent hooks use native schemas" <<< "$doctor_output" || \
   ! grep -q "Antigravity PreToolUse policy hook uses the native named-hook schema" <<< "$doctor_output"; then
    echo "FAILED: Doctor did not structurally validate installed hooks"
    echo "$doctor_output"
    exit 1
fi

echo "Test 3a: Doctor repairs stale Claude and Cursor schemas"
node -e "var fs=require('fs'); var c=JSON.parse(fs.readFileSync('$HOME/.claude/settings.json')); c.hooks={stop:'bash stale/verify-gate.sh --platform CLAUDE'}; fs.writeFileSync('$HOME/.claude/settings.json', JSON.stringify(c, null, 2));"
node -e "var fs=require('fs'); var c=JSON.parse(fs.readFileSync('$HOME/.cursor/hooks.json')); delete c.version; c.hooks={stop:'bash stale/verify-gate.sh --platform CURSOR'}; fs.writeFileSync('$HOME/.cursor/hooks.json', JSON.stringify(c, null, 2));"
node -e "var fs=require('fs'); var c=JSON.parse(fs.readFileSync('$HOME/.gemini/settings.json')); c.hooks.BeforeTool=[{matcher:'*',hooks:[{type:'command',command:'bash scripts/lite/gemini-before-tool-gate.sh'}]}]; fs.writeFileSync('$HOME/.gemini/settings.json', JSON.stringify(c, null, 2));"
node -e "var fs=require('fs'); var p='$HOME/.gemini/config/hooks.json'; var c=JSON.parse(fs.readFileSync(p)); c['forgewright-policy']={PreToolUse:[{matcher:'run_command',hooks:[{command:'bash stale.sh',timeout:0}]}]}; fs.writeFileSync(p, JSON.stringify(c, null, 2));"
printf 'approval_policy = "never"\n[features]\nhooks = true\n[hooks]\n' > "$HOME/.codex/config.toml"
stale_output=$(bash scripts/forgewright-hook-doctor.sh --quick 2>&1 || true)
if ! grep -q "Claude Stop hook schema is invalid" <<< "$stale_output" || \
   ! grep -q "Cursor stop hook NOT configured correctly" <<< "$stale_output" || \
   ! grep -q "Gemini BeforeTool or AfterAgent hook is not configured correctly" <<< "$stale_output" || \
   ! grep -q "Antigravity PreToolUse policy hook is not configured correctly" <<< "$stale_output" || \
   ! grep -q "Codex Stop hook NOT configured correctly" <<< "$stale_output"; then
    echo "FAILED: Doctor accepted stale lowercase/string hook schemas"
    exit 1
fi
bash scripts/forgewright-hook-doctor.sh --quick --fix >/dev/null 2>&1 || true

claude_repaired=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.claude/settings.json')); console.log(!('stop' in c.hooks) && Array.isArray(c.hooks.Stop) && c.hooks.Stop.some(g => Array.isArray(g.hooks) && g.hooks.some(h => h.type === 'command' && h.command.includes('stop-gate.sh --platform CLAUDE'))));")
cursor_repaired=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.cursor/hooks.json')); console.log(c.version === 1 && Array.isArray(c.hooks.stop) && c.hooks.stop.some(h => typeof h.command === 'string' && h.command.includes('stop-gate.sh --platform CURSOR')));")
codex_repaired=$(python3 -c "import sys,tomllib; c=tomllib.load(open(sys.argv[1],'rb')); print(any(any(h.get('type') == 'command' and 'stop-gate.sh --platform CODEX' in h.get('command','') for h in g.get('hooks',[])) for g in c.get('hooks',{}).get('Stop',[])))" "$HOME/.codex/config.toml")
gemini_repaired=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/settings.json')); console.log(Array.isArray(c.hooks.BeforeTool) && c.hooks.BeforeTool.some(g => g.matcher === '*' && Array.isArray(g.hooks) && g.hooks.some(h => h.name === 'forgewright-policy' && h.type === 'command' && h.command.includes('gemini-before-tool-gate.sh') && typeof h.timeout === 'number')));")
antigravity_repaired=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/config/hooks.json')); var n=c['forgewright-policy']; console.log(Boolean(n && Array.isArray(n.PreToolUse) && n.PreToolUse.some(g => g.matcher === '*' && Array.isArray(g.hooks) && g.hooks.some(h => h.command.includes('antigravity-pre-tool-gate.sh') && Number.isInteger(h.timeout) && h.timeout > 0))));")
if [[ "$claude_repaired" != "true" || "$cursor_repaired" != "true" || "$codex_repaired" != "True" || "$gemini_repaired" != "true" || "$antigravity_repaired" != "true" ]]; then
    echo "FAILED: Doctor did not repair stale hook schemas"
    exit 1
fi

node -e "var fs=require('fs'); var p='$HOME/.gemini/config/hooks.json'; var c=JSON.parse(fs.readFileSync(p)); c['forgewright-policy'].PreToolUse[0].hooks[0].command='true || bash scripts/lite/antigravity-pre-tool-gate.sh'; fs.writeFileSync(p, JSON.stringify(c, null, 2));"
wrapper_output=$(bash scripts/forgewright-hook-doctor.sh --quick 2>&1 || true)
if ! grep -q "Antigravity PreToolUse policy hook is not configured correctly" <<< "$wrapper_output"; then
    echo "FAILED: Doctor accepted an Antigravity hook command wrapper"
    exit 1
fi
bash scripts/forgewright-hook-doctor.sh --quick --fix >/dev/null 2>&1 || true

echo "Test 3b: Doctor warns without mutating Antigravity always-proceed preference"
mkdir -p "$HOME/.gemini/antigravity-cli"
printf '{"toolPermission":"always-proceed","keep":"unchanged"}\n' > "$HOME/.gemini/antigravity-cli/settings.json"
settings_before=$(shasum -a 256 "$HOME/.gemini/antigravity-cli/settings.json" | cut -d' ' -f1)
permission_output=$(bash scripts/forgewright-hook-doctor.sh --quick --fix 2>&1 || true)
settings_after=$(shasum -a 256 "$HOME/.gemini/antigravity-cli/settings.json" | cut -d' ' -f1)
if ! grep -q "Antigravity toolPermission is always-proceed" <<< "$permission_output" || [[ "$settings_before" != "$settings_after" ]]; then
    echo "FAILED: Doctor did not warn or silently mutated Antigravity preferences"
    exit 1
fi

echo "All tests passed."
rm -rf "$TEMP_HOME"
