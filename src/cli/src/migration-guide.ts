/**
 * Migration Guide - CLI v2.0
 *
 * For human users: No changes required
 * For AI agents: Use --json flag for structured output
 */

export const MIGRATION_GUIDE = `
# Migrating to Forgewright CLI v2.0

## For Human Users

**No changes required.** All existing commands work exactly as before.

New features available:
- \`forge tools list\` — List all available tools
- \`forge doctor\` — Check system health
- \`forge config\` — Configuration management

## For AI Agents

### Tool Discovery

Before (manual):
\`\`\`bash
# Manually browse skills/
ls skills/
\`\`\`

After (automated):
\`\`\`bash
forge tools list --json | jq '.data.tools[] | .name'
\`\`\`

### Structured Output

Before (parse text):
\`\`\`bash
forge --version
# Output: 2.0.0
\`\`\`

After (parse JSON):
\`\`\`bash
forge --version --json
# Output: { "ok": true, "data": { "version": "2.0.0" } }
\`\`\`

### Error Handling

Use exit codes:

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Continue |
| 1 | Tool error | Retry or skip |
| 2 | Usage error | Fix arguments |
| 3 | Config error | Check config |
| 4 | Auth error | Check credentials |
| 5 | Timeout | Retry with timeout |
| 6 | Missing dep | Install dependency |
| 7 | Internal error | Report bug |

## Configuration

### New Config Location

Old (deprecated):
\`\`\`
~/.forgewright/config.json
\`\`\`

New (recommended):
\`\`\`
~/.config/forgewright/config.json
\`\`\`

### Config Priority (highest to lowest)

1. \`FORGE_*\` environment variables
2. \`~/.config/forgewright/config.json\`
3. Process environment
4. \`.env\` files
5. Inline flags

### Example

\`\`\`bash
# Set via environment
export FORGE_DEBUG=1

# Set via config file
forge config set forge.debug true

# Set via flag
forge --debug validate
\`\`\`

## Breaking Changes

**None.** All existing commands are fully backward compatible.

## Deprecations

| Deprecated | Replacement | Removed in |
|------------|--------------|------------|
| \`~/.forgewright/\` | \`.forgewright/\` in project | v3.0 |

## Feature Flags

If you need legacy behavior:
\`\`\`bash
FORGE_LEGACY_OUTPUT=1 forge validate
\`\`\`

## Examples

### Full Workflow Example

\`\`\`bash
#!/bin/bash

# 1. Check system health
forge doctor --json || exit 1

# 2. List available tools
TOOLS=$(forge tools list --json | jq -r '.data.tools[].name')

# 3. Run quality gate
forge validate --json --level 3 || {
  echo "Validation failed"
  exit 1
}

# 4. Get config
forge config list --json
\`\`\`

### Agent Integration Example

\`\`\`python
import subprocess
import json

def forge_command(cmd: list[str]) -> dict:
    result = subprocess.run(
        ["forge", "--json"] + cmd,
        capture_output=True,
        text=True
    )
    data = json.loads(result.stdout)

    if not data["ok"]:
        raise Exception(data["error"]["message"])

    return data["data"]

# Usage
tools = forge_command(["tools", "list"])
validate = forge_command(["validate", "--level", "3"])
\`\`\`
`;

export default MIGRATION_GUIDE;
