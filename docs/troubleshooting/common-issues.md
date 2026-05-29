# Common Issues and Solutions

> **Quick fixes for frequent problems**

## Setup Issues

### "Forgewright didn't respond correctly"

**Symptoms:** AI assistant doesn't follow Forgewright pipeline

**Solution:**
1. Verify CLAUDE.md or AGENTS.md exists in project root:
   ```bash
   ls -la CLAUDE.md AGENTS.md
   ```

2. Run MCP setup:
   ```bash
   bash scripts/forgewright-mcp-setup.sh --diagnose
   ```

3. Restart your AI client

---

### "MCP tools not working"

**Symptoms:** `gitnexus_*` tools unavailable

**Solution:**
1. Check MCP config:
   ```bash
   cat ~/.cursor/mcp.json | jq
   ```

2. Re-run setup:
   ```bash
   bash scripts/forgewright-mcp-setup.sh
   ```

3. Verify server path exists:
   ```bash
   ls ~/.forgewright/mcp-server/server.ts
   ```

---

## Mode Detection Issues

### "Wrong mode selected"

**Symptoms:** Forgewright uses the wrong skill pipeline

**Solution:**
1. Add more context to your request:
   ```
   Bad: "help me"
   Good: "help me add JWT authentication to my Node.js API"
   ```

2. Explicitly state the mode:
   ```
   "Build this as a Feature: add user login"
   ```

3. Check confidence score in output:
   ```
   Mode: Feature (confidence: 0.87)
   ```

---

### "Mode is ambiguous"

**Symptoms:** Forgewright asks which mode to use

**Solution:**
Provide more specific keywords:

| Vague | Specific |
|-------|----------|
| "build an app" | "build a SaaS" |
| "fix it" | "debug the login error" |
| "make it faster" | "optimize database queries" |

---

## Skill Issues

### "Skill not found"

**Symptoms:** Error when trying to use a skill

**Solution:**
1. Check skill exists:
   ```bash
   ls skills/*/SKILL.md
   ```

2. Use the alias loader:
   ```bash
   bash skills/_shared/skill-alias-loader.sh <skill-name>
   ```

3. Check for typos in skill name

---

### "Deprecated skill warning"

**Symptoms:** Warning about deprecated skill name

**Solution:**
Update to new skill name:

```bash
# Old (deprecated)
skill: software-engineer

# New
skill: fullstack-engineer
```

See [Migration Guide](../migration/v8-to-v9.md) for all name changes.

---

## Plan Quality Issues

### "Plan quality loop too slow"

**Symptoms:** Long wait times for simple requests

**Solution:**
Enable fast-path scoring in `.production-grade.yaml`:

```yaml
planQuality:
  fastPath:
    enabled: true
    maxSteps: 5
    maxComplexity: 3
```

---

### "Plan score too low, can't proceed"

**Symptoms:** Plan repeatedly fails quality gate

**Solution:**
1. Review weak criteria shown in output
2. Add more specificity to your request
3. Break down complex requests into smaller steps
4. Research similar implementations

---

## Memory Issues

### "Context not persisting between sessions"

**Symptoms:** Forgewright doesn't remember previous work

**Solution:**
1. Check memory is enabled:
   ```bash
   python3 scripts/memory-middleware.py status
   ```

2. Run checkpoint:
   ```bash
   python3 scripts/memory-middleware.py checkpoint
   ```

3. Check session log:
   ```bash
   cat .forgewright/session-log.json
   ```

---

## Game Build Issues

### "Wrong game engine selected"

**Symptoms:** Unity instead of Godot, etc.

**Solution:**
Explicitly mention the engine:

```
Bad: "build a game"
Good: "build a Godot game"
Good: "build a Unity 2D platformer"
```

---

## Documentation Issues

### "Documentation is outdated"

**Solution:**
1. Check if there's a newer version:
   ```bash
   git fetch origin
   git log --oneline -1
   ```

2. Update Forgewright:
   ```bash
   git pull origin main
   ```

3. Check the [latest docs online](https://github.com/buiphucminhtam/forgewright)

---

## Getting More Help

| Issue Type | Resource |
|------------|----------|
| Bug report | [GitHub Issues](https://github.com/buiphucminhtam/forgewright/issues) |
| Questions | [GitHub Discussions](https://github.com/buiphucminhtam/forgewright/discussions) |
| Feature requests | [GitHub Discussions](https://github.com/buiphucminhtam/forgewright/discussions) |

---

*Common Issues version: 1.0 | Updated: 2026-05-29*
