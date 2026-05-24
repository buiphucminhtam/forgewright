---
description: First-time setup of Forgewright as a git submodule in your project
---

# Setup Forgewright

## Prerequisites
- Git installed
- Inside a git repository (run `git init` if not)

## Steps

// turbo-all

1. Add Forgewright as a git submodule:
```bash
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git forgewright
```

2. Initialize the submodule:
```bash
git submodule update --init --recursive
```

3. Copy config files to project root:
```bash
cp forgewright/AGENTS.md .
cp forgewright/CLAUDE.md .
```

4. Verify installation — check that SKILL.md exists:
```bash
cat forgewright/skills/production-grade/SKILL.md | head -5
```

5. Check the installed version:
```bash
cat forgewright/VERSION
```

6. Stage and commit:
```bash
git add .gitmodules forgewright AGENTS.md CLAUDE.md
git commit -m "feat: add Forgewright"
```

## After Setup

You're ready to go! Try:
- "Build a production-grade SaaS for [your idea]"
- "Help me think about [your idea]"
- "Review my code"
- "Write tests for this project"

Run `/update` anytime to check for new versions.
