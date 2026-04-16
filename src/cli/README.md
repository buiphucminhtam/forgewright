# Forgewright CLI - Agent-First Command Line Interface

> **Version:** 2.0.0-alpha.1
> **Status:** Alpha

Dual-purpose CLI designed for both humans and AI agents.

## Features

- **Tool Registry** - Discover and invoke 21+ tools
- **JSON Output** - Machine-readable for AI agents
- **Standardized Exit Codes** - 0-7 for error handling
- **Config Layering** - 5-source priority system
- **Shell Completions** - bash, zsh, fish

## Installation

```bash
# From source
cd src/cli
npm install
npm run build

# Link globally
npm link
```

## Quick Start

### Human Mode

```bash
forge tools list
forge skills list
forge doctor
forge validate --level 3
```

### Agent Mode

```bash
# Tool discovery
forge tools list --json | jq '.data.tools[].name'

# Structured output
forge doctor --json

# Quality gate
forge validate --level 3 --json | jq '.data.score'
```

## Commands

### Tools

```bash
forge tools list                          # List all tools
forge tools list --category engineering    # Filter by category
forge tools list --search api             # Search tools
forge tools:call skills.list              # Call a tool
forge tools:call skills.list --args '{}'   # Call with args
```

### Skills

```bash
forge skills list                          # List all skills
forge skills list --category engineering  # Filter by category
forge skills search api                   # Search skills
forge skills categories                   # List categories
```

### Config

```bash
forge config list                          # List all config
forge config get forge.debug              # Get value
forge config set forge.debug true         # Set value
forge config init                          # Create config file
forge config delete forge.debug           # Delete value
```

### Doctor

```bash
forge doctor                               # Run diagnostics
forge doctor --verbose                    # Verbose output
forge doctor --json                       # JSON output
```

### Validate

```bash
forge validate                             # Run all checks
forge validate --level 1                  # Build only
forge validate --level 2                  # + Regression
forge validate --level 3                  # + Standards
forge validate --strict                   # Treat warnings as errors
forge validate --json                     # JSON output
forge validate --report report.json       # Save report
```

### Completion

```bash
# Bash
source <(forge completion bash)

# Zsh
source <(forge completion zsh)

# Fish
forge completion fish > ~/.config/fish/completions/forge.fish
```

## Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--json` | `-j` | Force JSON output (agent mode) |
| `--no-color` | | Disable colored output |
| `--quiet` | `-q` | Suppress stdout |
| `--debug` | | Enable debug mode |
| `--version` | `-V` | Show version |
| `--help` | `-h` | Show help |

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | OK | Success |
| 1 | TOOL_ERROR | Tool execution failed |
| 2 | USAGE_ERROR | Invalid arguments |
| 3 | CONFIG_ERROR | Configuration error |
| 4 | AUTH_ERROR | Authentication error |
| 5 | TIMEOUT | Operation timed out |
| 6 | MISSING_DEPENDENCY | Required dependency not found |
| 7 | INTERNAL_ERROR | Internal error |

## Configuration

### Config Sources (Priority)

1. Environment variables (`FORGE_*`)
2. User config (`~/.config/forgewright/config.json`)
3. Process environment
4. `.env` files
5. Inline flags

### Environment Variables

```bash
FORGE_DEBUG=1           # Enable debug mode
FORGE_LEGACY_OUTPUT=1   # Force legacy output
NO_COLOR=1              # Disable colors
```

## JSON Envelope

All commands return a standardized JSON envelope:

```json
{
  "ok": true,
  "tool": "doctor.check",
  "data": { ... },
  "metadata": {
    "duration_ms": 123,
    "version": "2.0.0-alpha.1"
  },
  "error": null
}
```

## Tool Registry

| Category | Tools |
|----------|-------|
| orchestration | orchestrator.execute, skills.list, skills.search, validate.quality, config.*, doctor.check |
| engineering | engineering.software, engineering.frontend, engineering.qa, engineering.security |
| devops | devops.deploy, devops.database |
| ai-ml | ai.engineer, ai.prompt |
| game-dev | game.design, game.unity, game.unreal |
| meta | meta.polymath, meta.memory |

## Examples

### AI Agent Workflow

```bash
#!/bin/bash

# 1. Check system
forge doctor --json || exit 1

# 2. List tools
TOOLS=$(forge tools list --json | jq -r '.data.tools[].name')

# 3. Run validation
forge validate --level 3 --json || {
  echo "Validation failed"
  exit 1
}

# 4. Get results
SCORE=$(forge validate --level 3 --json | jq '.data.score')
echo "Score: $SCORE"
```

### Python Integration

```python
import subprocess
import json

def forge_command(cmd: list) -> dict:
    result = subprocess.run(
        ["forge", "--json"] + cmd,
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)

# Usage
tools = forge_command(["tools", "list"])
doctor = forge_command(["doctor"])
validate = forge_command(["validate", "--level", "3"])
```

## Development

```bash
cd src/cli

# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Test
npm test
```

## License

MIT
