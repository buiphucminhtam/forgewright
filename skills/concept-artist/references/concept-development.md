# Concept Development Reference

Use this reference for full concept explorations, scored direction selection,
or category-specific handoffs.

## Direction Matrix

| Field | Direction A | Direction B | Direction C |
|---|---|---|---|
| Premise | | | |
| Dominant silhouette / massing | | | |
| Composition / value hierarchy | | | |
| Shape grammar | | | |
| Palette / lighting mechanism | | | |
| Material / edge language | | | |
| Story, gameplay, brand, or UX benefit | | | |
| Production feasibility | | | |
| Extensibility | | | |
| Primary risk | | | |
| What makes it structurally distinct | | | |

## Selection Rubric

Score only when evidence exists; explain each score.

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| Intent clarity | unreadable | understandable with explanation | immediate first read |
| Distinctiveness | derivative/generic | some ownable mechanisms | unmistakable, defensible thesis |
| Functional fit | conflicts with use | workable with changes | reinforces function |
| Context fit | fails scale/camera/platform | partially survives | robust in real context |
| Production feasibility | undefined/impractical | known risks | repeatable within budget |
| Extensibility | one-off image | supports limited variants | coherent family/state range |
| Reference integrity | copies/averages | mixed transfer discipline | mechanisms transformed with clear boundaries |

Do not total scores mechanically when one criterion is a hard constraint.

## Packet Templates

### Character / Creature

- role read and emotional promise;
- silhouette family and proportion chart;
- front/side/back or construction views when production needs them;
- face, hands, costume, weapon/tool, and movement callouts;
- gameplay/camera-scale mockup;
- invariant identity features and controlled variation;
- animation/deformation risks.

### Environment / World

- spatial thesis and traversal/readability goal;
- landmark, midground, and background hierarchy;
- blockout/massing, value key, color/light keys;
- material ecology and architectural grammar;
- weather, time, damage, or progression variants;
- camera/scale evidence and modularity risks.

### Prop / Vehicle

- user and function sequence;
- scale, grip/contact/interaction points;
- construction and material logic;
- orthographic/exploded views when needed;
- state changes, wear, damage, and animation requirements.

### Keyframe / Illustration

- story beat and before/after continuity;
- focal hierarchy, staging, camera/lens, depth layers;
- grayscale value key before final color;
- lighting motivation and atmosphere;
- reusable world/character design information extracted from the frame.

### Product / UI Visual Identity

- user/brand promise and visual thesis;
- structural composition motif, shape grammar, typography relationship;
- light/dark, responsive, and interaction-state implications;
- representative screen/style frame in realistic content;
- accessibility and implementation constraints.

## Review Questions

1. What does the viewer understand in the first two seconds?
2. Which design mechanism carries the concept if color and detail are removed?
3. What is ownable rather than borrowed from the references?
4. What breaks at the intended scale, camera, crop, or state?
5. Which part is expensive, fragile, or difficult to reproduce consistently?
6. What must Art Direction lock, and what should remain variable?

## Web-game production handoff

Bind applicable character, environment and UI concepts to the game-experience required set and existing creative authority. Characters need identity/silhouette/proportion and required views/poses at actual camera scale; environments need blockout/traversal or depth layers, landmarks/material/readability and applicable modular pieces; UI needs representative screens, family/state anatomy and tokens. Legitimate absent categories are N/A with a reason, never automatically generated.

Concept art is not a production sprite animation or GLB. Phaser sprites require common frame dimensions/count, anchor/scale, named animation keys and engine preview; textured stretch UI declares nine-slice margins when applicable. Three models use GLB/glTF 2.0, consistent meters/Y-up, pivot/scale, material/texture expectations, required clip names and applicable collision/LOD strategy. Source/license/hash and import observations bind the same asset. `game_asset_import.py` checks source structure and observed metadata; actual rendered loading, animation, readability and device budgets need current engine evidence. Static props do not require a rig or animation.
