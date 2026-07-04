---
name: godot-multiplayer
description: "Orchestrates Godot-specific multiplayer networking implementations, client-server state synchronization, RPC annotations, MultiplayerSpawner setups, and lobby management. Use when the user requests multiplayer features, real-time replication configs, dedicated server binaries, or custom ENet peer architectures in Godot 4."
version: 1.0.0
---

# Godot Multiplayer (LITE)

## SOLVE Step 2: GROUND (Godot Multiplayer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Project is initialized with a valid Godot config | `cat project.godot` | ... | run the check command and paste output |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Godot Multiplayer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Inspect SceneReplicationConfig resources and node synchronization parameters | Verify that serialized property replication intervals are optimized and only authoritative variables sync.
2. SYNCHRONIZE | Implement GDScript network objects utilizing `@rpc` annotations | Verify that RPC configs (e.g., `any_peer`, `authority`, `call_local`) enforce server validation on client inputs.
3. SCALE | Set up MultiplayerSpawner and MultiplayerSynchronizer node paths in scene `.tscn` files | Confirm dynamically spawned entities automatically replicate across connected peers without manual instance tracking.

## Common Mistakes Checklist
- **Client-Authoritative RPC Processing**: Allowing clients to trigger state-altering parameters (e.g., modifying health arrays, damage indicators) on the server using `@rpc("any_peer")` without validating sender peer IDs.
- **Dangling Network Peer Disconnections**: Neglecting to unsubscribe local callback handlers from `peer_connected`, `peer_disconnected`, or `server_disconnected` on scene unload, triggering memory leaks.
- **Non-Compliant Resource Directories**: Saving multiplayer topologies, networking diagrams, or deployment runbooks under `docs/` using CamelCase instead of lowercase kebab-case (e.g., `docs/01-product/multiplayer-specs.md`).

### Step 1: Verify the game dev project configuration
```bash
cat .forgewright/project-profile.json
```

### Step 2: Implement a server-authoritative player replication script in GDScript
Create `res://scripts/player_network.gd`:
```gdscript
extends CharacterBody2D
class_name PlayerNetwork

# Enforce Server Authoritative positions via MultiplayerSynchronizer
@export var sync_position: Vector2:
	set(value):
		sync_position = value
		if not multiplayer.is_server():
			global_position = sync_position

@onready var synchronizer = $MultiplayerSynchronizer

func _physics_process(_delta: float) -> void:
	if multiplayer.is_server():
		# Authoritative movement processing on server
		velocity = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down") * 300.0
		move_and_slide()
		sync_position = global_position
	elif is_multiplayer_authority():
		# Send raw input to server for execution rather than translating client directly
		transmit_input_server.rpc(Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down"))

# Server-validated RPC prevents cheating by validating the peer authority
@rpc("any_peer", "call_local", "unreliable")
func transmit_input_server(direction: Vector2) -> void:
	var sender_id = multiplayer.get_remote_sender_id()
	if sender_id == get_multiplayer_authority():
		velocity = direction.normalized() * 300.0
		move_and_slide()
		sync_position = global_position
```
