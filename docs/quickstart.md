# Forgewright Quickstart Guide

> **Get up and running with Forgewright in 5 minutes**

## Prerequisites

- Git installed
- Claude Code, Cursor IDE, or Antigravity installed
- Basic familiarity with command line

## Installation

### 1. Clone or Add as Submodule

**Option A: Clone directly**
```bash
git clone https://github.com/buiphucminhtam/forgewright.git
cd forgewright
```

**Option B: Add as submodule to existing project**
```bash
git submodule add https://github.com/buiphucminhtam/forgewright.git forgewright
cd forgewright
```

### 2. Setup MCP (Optional but Recommended)

```bash
# Run the setup script
bash scripts/forgewright-mcp-setup.sh

# Verify setup
bash scripts/forgewright-mcp-setup.sh --check
```

This enables MCP tools for enhanced code intelligence.

### 3. Initialize for Your Project

```bash
# Run onboarding to analyze your project
forgewright onboard

# Or manually create config
cp .production-grade.yaml.example .production-grade.yaml
```

## Your First Request

Start a conversation with your AI assistant:

```
You: "Help me build a user authentication system with JWT"
```

Forgewright will:
1. **Interpret** your request
2. **Classify** it as a Feature or Full Build
3. **Plan** the implementation
4. **Execute** with the appropriate skills

## The 24 Modes

| Mode | Use When | Example |
|------|----------|---------|
| **Full Build** | Building from scratch | "Build a SaaS for task management" |
| **Feature** | Adding to existing code | "Add login to my app" |
| **Review** | Code review | "Review my authentication code" |
| **Debug** | Bug fixes | "Fix the login bug" |
| **Ship** | Deployments | "Deploy to production" |
| **Test** | Writing tests | "Add tests for auth" |
| **Game Build** | Game development | "Build a Unity game" |
| **XR Build** | VR/AR projects | "Create a VR experience" |
| ... | [See all modes](mode-reference.md) | |

## Common Workflows

### Build a New Project

```
User: "Build a full-stack task management app with React and Node.js"
Forgewright: 
  1. DEFINE → Creates architecture
  2. BUILD → Implements backend + frontend
  3. HARDEN → Security, testing
  4. SHIP → Deployment
```

### Add a Feature

```
User: "Add user roles and permissions to the API"
Forgewright:
  1. PM → Scopes the feature
  2. Architect → Designs the RBAC system
  3. Engineer → Implements
  4. QA → Tests
```

### Debug an Issue

```
User: "Users can't log in on mobile"
Forgewright:
  1. Debugger → Investigates root cause
  2. Engineer → Implements fix
  3. QA → Verifies fix
```

### Review Code

```
User: "Review the security of my authentication module"
Forgewright:
  1. Code Reviewer → Reviews architecture
  2. Security Engineer → Checks for vulnerabilities
  3. Report → Lists findings with severity
```

## Configuration

Edit `.production-grade.yaml` to customize:

```yaml
# Enable fast-path for simple requests
planQuality:
  fastPath:
    enabled: true

# Customize skill routing
skillRouting:
  fuzzyMatching:
    enabled: true
    minConfidence: 0.7

# Memory settings
memory:
  checkpoint:
    messageThreshold: 5
```

## Next Steps

| Topic | Resource |
|-------|----------|
| All modes explained | [Mode Reference](mode-reference.md) |
| All skills catalog | [Skill Catalog](skill-catalog.md) |
| Architecture deep-dive | [Architecture Overview](architecture.md) |
| Game development | [Game Build Guide](game-build-gates.md) |
| Mobile development | [Mobile Engineer Skill](../skills/mobile-engineer/SKILL.md) |

## Troubleshooting

### "Forgewright didn't respond correctly"

1. Check `.production-grade.yaml` exists
2. Run `bash scripts/forgewright-mcp-setup.sh --diagnose`
3. Verify CLAUDE.md or AGENTS.md is in project root

### "Wrong mode selected"

The orchestrator uses fuzzy matching. Add more context:

```
Bad: "help me"
Better: "help me add JWT authentication to my Node.js API"
```

### "Skills not loading"

Check skill paths in `skills/production-grade/SKILL.md` and verify skills directory exists.

## Getting Help

- **Documentation**: [docs/index.md](index.md)
- **Issues**: [GitHub Issues](https://github.com/buiphucminhtam/forgewright/issues)
- **Discussions**: [GitHub Discussions](https://github.com/buiphucminhtam/forgewright/discussions)

---

*Quickstart version: 1.0 | Last updated: 2026-05-29*
