# Forgewright README Structure & Commit Checklist

## 📋 Required Sections

Every README update should include all sections below. Check off when verified.

### 1. Project Identity (Top of file)
- [ ] Title: "Forgewright — AI Orchestrator That Actually Learns"
- [ ] Badges: Stars, Forks, Version, Skills count, License
- [ ] One-liner value proposition
- [ ] ASCII demo showing the workflow

### 2. Quick Start
- [ ] Prerequisites (Node 18+, Git)
- [ ] One-command setup
- [ ] Minimal example conversations

### 3. Core Features
- [ ] Feature comparison table (vs other AI tools)
- [ ] 4 Power Levels diagram
- [ ] What Can You Do table

### 4. Architecture
- [ ] MCP Setup instructions (Level 4)
- [ ] Multi-Project Architecture diagram
- [ ] Workspace Detection priority list
- [ ] Updating existing installations

### 5. Featured Capabilities (Add new section for each major feature)
- [ ] ASIP — The Self-Improving Protocol
- [ ] Token Tracking & Cost Analytics ⭐ (NEW)
- [ ] GitNexus — Code Intelligence CLI
- [ ] Multica Hub — Dashboard
- [ ] Any new skill/capability

### 6. Operational
- [ ] Quality Gate (validation scores)
- [ ] Troubleshooting section
- [ ] FAQ

### 7. Community
- [ ] Contributing guidelines
- [ ] License
- [ ] Support/Donation

---

## ✅ Commit Checklist

When committing changes, verify:

### New Feature Added?
- [ ] Document in README with dedicated section
- [ ] Include quick start commands
- [ ] Add architecture diagram if complex
- [ ] Add troubleshooting tips
- [ ] Update skills count badge if new skill

### Bug Fix?
- [ ] Add to Troubleshooting if common issue
- [ ] Update FAQ if user-facing

### New Integration?
- [ ] Add to MCP Setup section
- [ ] Update architecture diagram
- [ ] Add prerequisites

### Token/API/CLI Change?
- [ ] Update Token Tracking section
- [ ] Update GitNexus section
- [ ] Update CLI commands
- [ ] Add to Troubleshooting

### New Skill?
- [ ] Add to Skills table (56 Skills)
- [ ] Update skills count in badge
- [ ] Add example usage
- [ ] Document in "What Can You Do" table

### Dashboard/UI Change?
- [ ] Document new endpoint
- [ ] Add screenshot or ASCII preview
- [ ] Update multica-hub integration notes

---

## 📐 Structure Standards

### Section Headers
```
## Section Name — Brief Description
```

### Code Blocks
- Shell commands: ```bash
- Config files: ```yaml or ```json
- ASCII diagrams: ``` for architecture

### Tables
- Always include headers
- Use pipe alignment
- Max 4 columns for readability

### Badges
- Keep at top, single line
- Include: Stars, Forks, Version, Skills, License

---

## 🎯 Content Standards

### Required per Section
1. **What** — What is this feature
2. **Why** — Why use it (benefits)
3. **How** — Quick start commands
4. **Example** — Real usage example

### Keep Current
- Version number at top
- Skills count badge
- Recent feature sections visible (ASIP, Token Tracking first)

### Exclude
- Outdated commands (check before commit)
- Broken links
- Incomplete sections marked TODO
- Implementation details (use docs/ instead)

---

## 🔄 Update Triggers

Update README when:
- Adding new skill
- Adding new feature
- Changing architecture
- Adding new integration
- Deprecating functionality
- Updating major version

---

## 📝 Section Templates

### New Feature Section
```markdown
## Feature Name — One-line description

Brief paragraph explaining the feature.

### Quick Start
```bash
# commands to get started
```

### Features
| Feature | Description |
|---------|-------------|
| X | Y |

### Example
```
$ command
output
```

### Configuration
```yaml
# example config
```
```

---

## Version Bump Checklist

When bumping version (e.g., 8.3.0 → 8.4.0):
- [ ] Update version badge
- [ ] Add "New in vX.X.X" section
- [ ] Update CHANGELOG.md if exists
- [ ] Verify all code examples work
