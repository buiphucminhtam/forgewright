---
name: game-accessibility-engineer
description: "Orchestrates game accessibility audits, subtitle integrations, re-mappable input configurations, and colorblindness shader alignments. Use when the user requests game accessibility audits, custom UI sizing, closed-caption systems, or input remapping bindings for Phaser, Three.js, Unity, Unreal, or Godot games."
version: 1.0.0
---

# Game Accessibility Engineer (LITE)

## SOLVE Step 2: GROUND (Game Accessibility Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target game development framework and visual packages are defined | `cat package.json \| jq '.dependencies["phaser"] // .dependencies["three"]'` | Confirms Phaser or Three.js framework version | |
| Keyboard, gamepad, and input map configurations are active | `find src/input/ -name "*map*" -o -name "*binding*"` | Locates standard input scheme and keybinding profiles | |
| Project-specific tech stack and game assets directory structure are mapped | `cat .forgewright/project-profile.json` | Displays target engine type, platform, and baseline state [1] | |
| Token expenditure limit is tracked for asset and code adjustments | `cat .forgewright/budget.yaml` | Verifies current session spend threshold rules [2] | |

## SOLVE Step 3: DECOMPOSE (Game Accessibility Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Inspect canvas scaling, color contrast ratios, and visual readability | Verify that all game HUD components render in high-contrast modes without text clipping or overlaps.
2. REMAP | Map abstract action models over hardcoded physical input controls | Confirm that all control bindings are completely re-mappable by the player via an input-mapping configuration layer.
3. CC | Build closed-captions and adjustable subtitle rendering handlers | Ensure captions display speaking character names, sound effect alerts, and customizable background opacity settings.
4. SYNC | Propagate game accessibility testing reports to the Obsidian Vault | Run the post-skill synchronization script to generate absolute symlinks under the unified workspace [3].

## Common Mistakes Checklist
- **Hardcoded Input Triggers**: Reading keyboard event codes directly (e.g., `event.code === 'KeyW'`) inside update loops, blocking alternative controller or single-switch device mappings.
- **Color-Only Informational Cues**: Delivering critical gameplay feedback (e.g., active health, team targets, or danger states) solely via green/red colors, excluding colorblind players.
- **Fixed Font Canvas Scaling**: Rendering HUD text at hardcoded pixel dimensions within game loops, causing text to blur or clip when players select large-font overlays.
- **Modal Input Focus Traps**: Failing to trap menu focus inside in-game pause overlays or dialog boxes, letting players trigger underlying game-world inputs via keyboard actions.
- **Non-Compliant Naming Conventions**: Creating testing results or logs inside `docs/` using CamelCase, spaces, or absolute links instead of strictly lowercase kebab-case [4].

## Worked Example

### Step 1: Verify the game engine environment and budget baseline
```bash
cat .forgewright/project-profile.json
cat .forgewright/budget.yaml
```
Output:
```json
{
  "project_name": "forgewright-phaser-game",
  "tech_stack": ["Phaser", "TypeScript"],
  "health_status": "PASS"
}
```

### Step 2: Implement a re-mappable input and subtitle controller under `src/input/accessible-input.ts`
```typescript
export interface InputActions {
  moveUp: string;
  moveDown: string;
  interact: string;
}

export class AccessibleInputManager {
  private bindings: InputActions;

  constructor() {
    // Ground default configuration matching remapping specs
    this.bindings = {
      moveUp: 'ArrowUp',
      moveDown: 'ArrowDown',
      interact: 'Space'
    };
  }

  // Update action bindings safely at runtime
  public remapAction(action: keyof InputActions, newKey: string): void {
    this.bindings[action] = newKey;
    console.log(`[REMAP] Action ${action} bound to ${newKey}`);
  }

  public handleInput(eventCode: string, onTrigger: (action: string) => void): void {
    if (eventCode === this.bindings.moveUp) onTrigger('up');
    if (eventCode === this.bindings.moveDown) onTrigger('down');
    if (eventCode === this.bindings.interact) onTrigger('interact');
  }
}
```

### Step 3: Run the post-skill sync to link documentation into the Shared Obsidian Vault
```bash
# Execute standard synchronization scripts
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/04-testing/game-accessibility-audit.md to /workspace/shared-obsidian-vault/forgewright/04-testing/game-accessibility-audit.md.
```
