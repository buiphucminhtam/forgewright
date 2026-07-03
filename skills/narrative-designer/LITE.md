---
name: narrative-designer
description: "Orchestrates game worldbuilding, story branching logic, character dialogue trees, quest design, and narrative flow validation. Use when the user requests game writing, branching narrative specs, NPC dialogue scripts, or quest progression flows."
version: 1.0.0
---

# Narrative Designer (LITE)

## SOLVE Step 2: GROUND (Narrative Designer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and game engine alignments are defined | `cat .forgewright/project-profile.json` | Displays target environment (e.g. Unity, Phaser, WebGL/Three.js) | |
| Standardized narrative docs or world bibles are tracked in correct paths | `find docs/00-vision/ -name "*narrative*" -o -name "*story*"` | Lists active lowercase, kebab-case narrative specs | |
| Template specifications exist for formatting consistency | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of the standardized feature spec layout | |
| Spend limits and API token tracking are configured for heavy text generation | `cat .forgewright/budget.yaml` | Displays current spend bounds and provider configurations | |

## SOLVE Step 3: DECOMPOSE (Narrative Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. ALIGN | Map dialogue flags and branch states to code-level keys | Verify that narrative conditions match game variables to prevent quest progression deadlocks.
2. WRITE | Generate story/quest specifications under `docs/01-product/` or `docs/00-vision/` | Ensure file names strictly use lowercase letters and kebab-case with no space separators (e.g. `quest-line-beta.md`).
3. VALIDATE | Parse dialogue structures, quest chains, or conditional JSON files | Verify compile syntax checks out clean without triggering parsing errors on runtime loops.
4. SYNC | Propagate live narrative graphs and world design files to Shared Obsidian Vault | Trigger post-skill hooks to symlink markdown specs and visualize plot node relationships via Obsidian's Graph View.

## Common Mistakes Checklist
- **Non-compliant naming conventions**: Creating narrative files under `docs/` that use camelCase, spaces, or uppercase letters (e.g., `docs/00-vision/NarrativeBible.md` instead of `docs/00-vision/narrative-bible.md`).
- **Orphan branch deadlocks**: Setting dialogue choices or quest steps with conditional state requirements that cannot be met, trapping the player in unresolvable loops.
- **Context window token bloat**: Loading massive, raw prose drafts or game scripts into the active model chat context instead of offloading logs to local reference caches.
- **Mismatched technical variables**: Outlining story states and variables in documentation without executing a formal gate with developers to sync game engine variables.
- **Unverified budget exhaustion**: Generating infinite procedural dialogue scripts without confirming tracking settings in `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Verify game engine profile and check target directories
```bash
cat .forgewright/project-profile.json
find docs/00-vision/ -type f
```
Output:
```json
{
  "project_name": "forgewright-rpg-game",
  "tech_stack": ["Three.js", "WebGL", "TypeScript"],
  "health_status": "PASS"
}
```

### Step 2: Draft a branching dialogue quest specification in `docs/01-product/quest-introduction.md`
```bash
cat << 'EOF' > docs/01-product/quest-introduction.md
# Feature: Introduction Quest Branching Dialogue

## 1. Executive Summary
Provide interactive onboarding quest dialogue mapped to WebGL state flags.

## 2. Character Nodes
- NPC: Blacksmith ForgeWright
- Player: Newly arrived system engineer

## 3. Acceptance Criteria (BDD)
Scenario: Player accepts quest
  Given the player approaches the Blacksmith NPC
  When dialogue state 'met_smith' is false and select option 'Accept Quest'
  Then set variable 'quest_state' to 1
  And trigger rendering animation 'smith-spark'
EOF
```

### Step 3: Compile and synchronize quest specifications to the Shared Obsidian Vault
```bash
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for quest-introduction.md.
[SUCCESS] Symlinked docs/01-product/quest-introduction.md to /workspace/shared-obsidian-vault/forgewright/01-product/quest-introduction.md.
```
