---
name: godot-engineer
description: "Orchestrates Godot game engine implementations, GDScript/C# scripting, scene hierarchy structures (.tscn), custom node signals, and game state parameters. Use when the user requests 2D/3D game loop setups, node transformations, custom physics calculations, UI controls, or scene transition scripts in Godot."
version: 1.0.0
---

# Godot Engineer (LITE)

## SOLVE Step 2: GROUND (Godot Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project structure contains a valid main project configuration | `cat project.godot` | Verifies active Godot project file, engine configuration, and rendering settings | |
| Project-specific tech stack and baseline profile are defined | `cat .forgewright/project-profile.json` | Project profile JSON confirming Godot and script languages (GDScript/C#) | |
| Active scripts, scene files, or resource catalogs are indexed | `find . -name "*.gd" -o -name "*.tscn" -o -name "*.tres"` | Lists active script modules, serialized scene layouts, and visual resources | |
| Token budgets and spending thresholds are configured | `cat .forgewright/budget.yaml` | Displays session cost ceilings and active token tracking metrics | |

## SOLVE Step 3: DECOMPOSE (Godot Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate node tree hierarchies, script attachments, and custom signal bindings | Verify that scripts are attached to correct node types and that signals are disconnected on scene exit to prevent dangling references.
2. IMPLEMENT | Author player movement or physics calculations scaling with delta-time parameters | Ensure frame-rate independent updates in `_physics_process(delta)` to prevent speed fluctuations on varying monitor refresh rates.
3. POOL | Set up custom node pools for high-frequency instanced objects (e.g., bullets) | Verify that objects are recycled using pre-allocated scene nodes rather than continuously calling `queue_free()` and `instantiate()`.
4. SYNC | Propagate implementation blueprints and export kebab-case logs to Obsidian | Run post-skill hooks to symlink generated documentation directly to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Framerate-Dependent Updates**: Calculating node transformations, gravity, or velocities inside `_process(delta)` or `_physics_process(delta)` without applying the `delta` multiplier, causing execution speed shifts.
- **Dangling Node Memory Leaks**: Freeing scenes or sub-nodes at runtime without disconnecting custom event signals or removing child nodes from the tree, leading to orphaned memory consumption.
- **Synchronous Resource Bloat**: Using `load()` to fetch heavy visual resources, meshes, or textures synchronously in the main thread during gameplay instead of preloading via `preload()` or utilizing async loaders.
- **Non-Compliant File Structures**: Creating scene configuration logs or architectural docs under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case (e.g., `bullet-physics-config.md`).
- **Unchecked API Spending**: Launching large procedural GDScript generations or node structural overhauls without validating current spend caps in `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground the Godot engine workspace configurations
```bash
cat .forgewright/project-profile.json
head -n 5 project.godot
```
Output:
```json
{
  "project_name": "forgewright-godot-rpg",
  "tech_stack": ["Godot", "GDScript"],
  "health_status": "PASS"
}
```
```ini
config_version=5

[application]
config/name="Forgewright Godot RPG"
run/main_scene="res://scenes/main.tscn"
```

### Step 2: Implement a high-performance, frame-independent bullet pooled controller in GDScript
Create `res://scripts/bullet_pool.gd`:
```gdscript
extends Node2D
class_name BulletPool

@export var bullet_scene: PackedScene
@export var max_pool_size: int = 50

var pool: Array[Node2D] = []

func _ready() -> void:
	# Ground: Pre-allocate nodes inside the pool to avoid runtime stutter
	for i in range(max_pool_size):
		var bullet = bullet_scene.instantiate() as Node2D
		bullet.visible = false
		bullet.set_process(false)
		bullet.set_physics_process(false)
		add_child(bullet)
		pool.append(bullet)

# Recycle nodes dynamically
func fire_bullet(global_spawn_position: Vector2, direction: Vector2) -> Node2D:
	for bullet in pool:
		if not bullet.visible:
			bullet.global_position = global_spawn_position
			bullet.direction = direction
			bullet.visible = true
			bullet.set_process(true)
			bullet.set_physics_process(true)
			return bullet
	return null # Pool exhausted safely
```

### Step 3: Document visual configurations and trigger live sync
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/projectile-node-pool.md
# Feature: Godot Bullet Node Pooling

## 1. Executive Summary
Provide an optimized, pre-allocated bullet spawning pool to prevent Garbage Collection frame drops.

## 2. Technical Profile
- Engine: Godot 4.x (GDScript)
- Node Constraints: 50 active pooled 2D entities maximum.
- Optimization: Pre-instantiated inside _ready() lifecycle hook.
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian Vault
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for projectile-node-pool.md.
[SUCCESS] Symlinked docs/01-product/projectile-node-pool.md to /workspace/shared-obsidian-vault/forgewright/01-product/projectile-node-pool.md.
```
