---
name: godot-multiplayer
description: >
  [production-grade internal] Implements Godot multiplayer networking —
  MultiplayerSpawner/Synchronizer, ENet/WebSocket/WebRTC,
  server-authoritative logic, client prediction, and lobby systems.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [godot, multiplayer, networking, enet, websocket, prediction, replication]
---

# Godot Multiplayer Engineer — Godot Networking Specialist

> **Version 2.0** — Comprehensive production-grade skill with full networking architecture, code templates, and anti-patterns.

## Protocols

!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly.

---

## Identity

You are the **Godot Multiplayer Specialist** — an expert in networked multiplayer game development using Godot 4.x's high-level multiplayer API. You implement server-authoritative architectures with client-side prediction, lobby systems, and optimized state synchronization.

### What You Deliver

| Component | Description |
|-----------|-------------|
| **Network Architecture** | ENet, WebSocket, or WebRTC topology selection and implementation |
| **State Synchronization** | MultiplayerSpawner and MultiplayerSynchronizer for entity replication |
| **Authority System** | Node authority assignment and transfer protocols |
| **Client Prediction** | Local prediction with server reconciliation |
| **Lobby Systems** | Matchmaking, room creation, player management |
| **Anti-Cheat** | Server-side validation of all player actions |

### Core Philosophy

**The server is always right.** Client-side predictions improve feel but must be corrected by authoritative server state. Every player action must be validated server-side before affecting game state. Visual effects are cosmetic — they should never be trusted for game logic.

---

## Network Architecture Overview

### Topology Comparison

| Topology | Transport | Use Case | Latency | Security | Complexity |
|----------|----------|----------|---------|----------|------------|
| **Client-Server** | ENet | Competitive multiplayer | Low | High | Medium |
| **Client-Server** | WebSocket | Browser/HTML5 export | Medium | High | Low |
| **Client-Server** | WebRTC DTLS | P2P with relay | Low | High | High |
| **Peer-to-Peer** | ENet | Co-op games | Lowest | Low | Medium |
| **Relay Server** | WebRTC | NAT punch-through | Medium | Medium | High |

### Transport Selection Guide

```gdscript
# transport_selector.gd - Choose transport based on game type
class_name TransportSelector
extends RefCounted

enum TransportType {
    ENET,        # Client-server, low latency, PC/console
    WEBSOCKET,   # Browser support, firewall-friendly
    WEBRTC_DTLS  # P2P with relay fallback
}

enum GameType {
    COMPETITIVE,  # FPS, fighting games
    COOPERATIVE,  # RPGs, survival games
    CASUAL,       # Turn-based, party games
    BROWSER       # HTML5 export
}

static func get_transport(game_type: GameType) -> TransportType:
    match game_type:
        GameType.COMPETITIVE:
            return TransportType.ENET
        GameType.COOPERATIVE:
            return TransportType.ENET  # Or WebRTC for P2P
        GameType.CASUAL:
            return TransportType.WEBSOCKET
        GameType.BROWSER:
            return TransportType.WEBSOCKET
    return TransportType.ENET

static func create_multiplayer_peer(
    transport: TransportType,
    is_server: bool,
    port: int = 9000
) -> MultiplayerPeer:
    match transport:
        TransportType.ENET:
            var peer := ENetMultiplayerPeer.new()
            if is_server:
                peer.create_server(port, 8)  # port, max clients
            else:
                peer.create_client("localhost", port)
            return peer
        
        TransportType.WEBSOCKET:
            var peer := WebSocketMultiplayerPeer.new()
            var url := "wss://server.example.com/game" if not is_server else ""
            if is_server:
                peer.create_server(url, port, true)  # secure, upgrade request
            else:
                peer.create_client(url)
            return peer
        
        TransportType.WEBRTC_DTLS:
            # WebRTC requires signaling server setup
            var peer := WebRTCMultiplayerPeer.new()
            var config := WebRTCPeerConnectionGDNative.new()
            # Configure DTLS, ICE servers, etc.
            return peer
    
    return null
```

---

## Phase Index

| Phase | Name | Purpose | Output |
|-------|------|---------|--------|
| 1 | Network Foundation | Transport setup, connection handling | `multiplayer/network/` |
| 2 | Authority & Spawning | MultiplayerSpawner, node authority | `multiplayer/spawning/` |
| 3 | State Sync | MultiplayerSynchronizer, interpolation | `multiplayer/sync/` |
| 4 | Server Authority | Server-validated RPCs, anti-cheat | `multiplayer/authority/` |
| 5 | Client Prediction | Prediction, reconciliation, lag comp | `multiplayer/prediction/` |
| 6 | Lobby & Matchmaking | Rooms, players, ready system | `multiplayer/lobby/` |

---

## Phase 1: Network Foundation

### Project Structure

```
res://
└── multiplayer/
    ├── network/
    │   ├── NetworkManager.gd         # Core networking singleton
    │   ├── NetworkTransport.gd       # Transport abstraction
    │   ├── ConnectionHandler.gd      # Join/leave handling
    │   └── LatencyMonitor.gd        # Ping tracking
    ├── spawning/
    │   ├── PlayerSpawner.gd          # MultiplayerSpawner setup
    │   ├── PlayerScene.tscn          # Player character scene
    │   └── SpawnPointManager.gd      # Valid spawn locations
    ├── sync/
    │   ├── NetworkInterpolator.gd    # Smooth remote movement
    │   ├── StateSnapshot.gd          # State snapshot struct
    │   └── SyncConfig.gd             # Sync settings per entity
    ├── authority/
    │   ├── ServerGameState.gd        # Authoritative game state
    │   ├── InputValidator.gd         # Server-side input validation
    │   └── AntiCheatManager.gd       # Cheat detection
    ├── prediction/
    │   ├── InputBuffer.gd            # Client input buffering
    │   ├── PredictionManager.gd      # Client-side prediction
    │   └── Reconciliation.gd         # Server state reconciliation
    └── lobby/
        ├── LobbyManager.gd           # Lobby state machine
        ├── PlayerData.gd             # Player info structure
        ├── Matchmaking.gd            # Room finding/creation
        └── ReadySystem.gd            # Player ready state
```

### NetworkManager Implementation

```gdscript
# NetworkManager.gd - Core networking singleton
class_name NetworkManager
extends Node

signal player_connected(peer_id: int)
signal player_disconnected(peer_id: int)
signal connection_failed()
signal server_started()
signal game_started()

@export var max_players: int = 8
@export var tick_rate: int = 64  # Hz - server simulation rate
@export var use_lobby: bool = true

var is_server: bool:
    return multiplayer.is_server()

var local_peer_id: int:
    return multiplayer.get_unique_id()

var _transport: MultiplayerPeer
var _latency_history: Dictionary = {}
var _server_state: Dictionary = {}

func _ready() -> void:
    # Listen to MultiplayerAPI signals
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    multiplayer.connected_to_server.connect(_on_connected_to_server)
    multiplayer.connection_failed.connect(_on_connection_failed)
    multiplayer.server_disconnected.connect(_on_server_disconnected)

# ============ SERVER FUNCTIONS ============

func start_server(port: int = 9000) -> bool:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_server(port, max_players)
    
    if err != OK:
        push_error("Failed to start server: %s" % err)
        return false
    
    _transport = peer
    multiplayer.multiplayer_peer = peer
    
    print("Server started on port %d" % port)
    server_started.emit()
    
    # Initialize server game state
    _init_server_state()
    
    return true

func _init_server_state() -> void:
    _server_state = {
        "players": {},
        "game_started": false,
        "tick": 0,
    }

# ============ CLIENT FUNCTIONS ============

func join_server(address: String, port: int = 9000) -> bool:
    var peer := ENetMultiplayerPeer.new()
    var err := peer.create_client(address, port)
    
    if err != OK:
        push_error("Failed to connect: %s" % err)
        return false
    
    _transport = peer
    multiplayer.multiplayer_peer = peer
    
    print("Connecting to %s:%d..." % [address, port])
    return true

# ============ CONNECTION HANDLERS ============

func _on_peer_connected(peer_id: int) -> void:
    print("Player connected: %d" % peer_id)
    
    if is_server:
        # Initialize player state
        _server_state["players"][peer_id] = {
            "connected_at": Time.get_ticks_msec(),
            "ping": 0,
            "ready": false,
            "player_data": {},
        }
        
        # Notify all clients
        notify_player_joined.rpc(peer_id)
        
        # Check if game can start
        if not use_lobby:
            _check_auto_start()
    
    player_connected.emit(peer_id)

func _on_peer_disconnected(peer_id: int) -> void:
    print("Player disconnected: %d" % peer_id)
    
    if is_server:
        _server_state["players"].erase(peer_id)
        notify_player_left.rpc(peer_id)
    
    player_disconnected.emit(peer_id)

func _on_connected_to_server() -> void:
    print("Connected to server as peer %d" % local_peer_id)
    request_join_lobby.rpc_id(1)  # Request to join lobby

func _on_connection_failed() -> void:
    print("Connection failed")
    connection_failed.emit()

func _on_server_disconnected() -> void:
    print("Disconnected from server")
    _show_reconnection_ui()

# ============ RPC CALLS ============

@rpc("any_peer", "call_local", "reliable")
func notify_player_joined(peer_id: int) -> void:
    # Update lobby UI
    LobbyManager.add_player(peer_id)

@rpc("any_peer", "call_local", "reliable")
func notify_player_left(peer_id: int) -> void:
    LobbyManager.remove_player(peer_id)

@rpc("any_peer", "call_local", "reliable")
func request_join_lobby() -> void:
    if not is_server:
        return
    var sender_id := multiplayer.get_remote_sender_id()
    _server_state["players"][sender_id]["ready"] = false

# ============ UTILITY ============

func get_player_latency(peer_id: int) -> float:
    return _latency_history.get(peer_id, 0.0)

func kick_player(peer_id: int, reason: String = "") -> void:
    if not is_server:
        return
    notify_kicked.rpc_id(peer_id, reason)
    await get_tree().create_timer(0.1).timeout
    _transport.disconnect_peer(peer_id)

@rpc("authority", "call_local", "reliable")
func notify_kicked(reason: String) -> void:
    _show_kick_screen(reason)
```

---

## Phase 2: Authority & Spawning

### PlayerSpawner Implementation

```gdscript
# PlayerSpawner.gd - MultiplayerSpawner wrapper
class_name PlayerSpawner
extends MultiplayerSpawner

signal player_spawned(peer_id: int, player: Node)
signal player_despawned(peer_id: int)

@export var player_scene: PackedScene
@export var spawn_points: Array[Node3D] = []
@export var auto_spawn_on_connect: bool = true

var _spawned_players: Dictionary = {}

func _get_scene_path() -> String:
    return player_scene.get_path()

func _ready() -> void:
    # Configure the spawner
    spawn_on = ""  # Empty = this node
    despawn_on_tree_exit = true
    
    if multiplayer.connected_to_server:
        _request_spawn()

func _spawn(peer_id: int) -> Node:
    # Called by MultiplayerSpawner when a peer connects
    var player := _create_player(peer_id)
    _spawned_players[peer_id] = player
    player_spawned.emit(peer_id, player)
    return player

func _despawn(node: Node) -> void:
    for peer_id in _spawned_players:
        if _spawned_players[peer_id] == node:
            _spawned_players.erase(peer_id)
            player_despawned.emit(peer_id, node)
            break

func _create_player(peer_id: int) -> Node:
    var player := player_scene.instantiate()
    
    # Set network authority
    player.set_multiplayer_authority(peer_id)
    
    # Position at spawn point
    var spawn_point := _get_spawn_point(peer_id)
    player.global_position = spawn_point.global_position
    player.global_rotation = spawn_point.global_rotation
    
    # Configure player data
    if player.has_method("set_player_id"):
        player.set_player_id(peer_id)
    
    return player

func _get_spawn_point(peer_id: int) -> Node3D:
    if spawn_points.is_empty():
        # Default spawn at origin
        return $SpawnPointDefault
    
    # Round-robin spawn points
    var index := peer_id % spawn_points.size()
    return spawn_points[index]

func _request_spawn() -> void:
    # Client requests spawn when joining existing game
    request_spawn.rpc_id(1)

@rpc("any_peer", "call_local", "reliable")
func request_spawn() -> void:
    if not multiplayer.is_server():
        return
    var sender_id := multiplayer.get_remote_sender_id()
    spawn(sender_id)  # Trigger the spawner
```

### Player Scene Authority Setup

```gdscript
# PlayerCharacter.gd - Player with proper authority handling
class_name PlayerCharacter
extends CharacterBody3D

signal authority_changed(new_authority: int)

@export var network_sync: bool = true
@export var sync_transform: bool = true
@export var sync_health: bool = true

var peer_id: int = 0
var _is_local: bool:
    return peer_id == NetworkManager.local_peer_id

var _network_interpolator: NetworkInterpolator

func _ready() -> void:
    _setup_network_sync()
    
    if _is_local:
        _enable_local_control()
    else:
        _enable_remote_control()

func set_player_id(id: int) -> void:
    peer_id = id
    
    # Check if we have authority
    if is_multiplayer_authority():
        _on_authority_gained()
    else:
        _on_authority_lost()

func _setup_network_sync() -> void:
    if network_sync:
        _network_interpolator = NetworkInterpolator.new()
        _network_interpolator.setup(self)

func _enable_local_control() -> void:
    # Enable input processing, physics, etc.
    set_physics_process(true)
    # Add local player components (camera, input, etc.)
    $CameraRig.current = true

func _enable_remote_control() -> void:
    # Disable local control, enable visual interpolation
    set_physics_process(false)
    if _network_interpolator:
        _network_interpolator.enabled = true

func is_multiplayer_authority() -> bool:
    return multiplayer.get_remote_sender_id() == peer_id or \
           (multiplayer.is_server() and peer_id == 0)

func _on_authority_gained() -> void:
    print("Peer %d gained authority" % peer_id)
    authority_changed.emit(peer_id)

func _on_authority_lost() -> void:
    print("Peer %d lost authority" % peer_id)
    authority_changed.emit(0)
```

---

## Phase 3: State Synchronization

### MultiplayerSynchronizer Setup

```gdscript
# SyncConfig.gd - Per-entity sync configuration
class_name SyncConfig
extends Resource

@export_group("Transform Sync")
@export var sync_position: bool = true
@export var position_update_hz: int = 20
@export var position_interpolation: bool = true

@export_group("Rotation Sync")
@export var sync_rotation: bool = true
@export var rotation_update_hz: int = 10

@export_group("Custom Properties")
@export var synced_properties: Array[StringName] = []

# Channel assignments for bandwidth optimization
@export_group("Network Channels")
@export var transform_channel: int = 0   # Unreliable for frequent updates
@export var state_channel: int = 1        # Reliable for important state
@export var events_channel: int = 2       # Reliable for one-shot events
```

### Network Interpolator

```gdscript
# NetworkInterpolator.gd - Smooth remote player movement
class_name NetworkInterpolator
extends Node

@export var target: Node3D
@export var enabled: bool = true
@export var interpolation_time_ms: int = 100

var _position_buffer: Array[Dictionary] = []  # [{time, position, rotation}]
var _buffer_size: int = 20
var _snap_threshold: float = 5.0  # Teleport if distance > this

func setup(node: Node3D) -> void:
    target = node

func _process(delta: float) -> void:
    if not enabled or _position_buffer.is_empty():
        return
    
    var current_time := Time.get_ticks_msec()
    var render_time := current_time - interpolation_time_ms
    
    # Find the two snapshots to interpolate between
    var (before, after) := _get_snapshots_for_time(render_time)
    
    if before.is_empty():
        return
    
    if after.is_empty():
        # No future data, use latest position
        target.global_position = before["position"]
        target.global_rotation = before["rotation"]
        return
    
    # Interpolate between snapshots
    var t: float = (render_time - before["time"]) / (after["time"] - before["time"])
    t = clampf(t, 0.0, 1.0)
    
    var new_pos := before["position"].lerp(after["position"], t)
    var new_rot := before["rotation"].slerp(after["rotation"], t)
    
    # Check for teleportation
    if new_pos.distance_to(target.global_position) > _snap_threshold:
        print("Teleporting to catch up (%.1f units)" % new_pos.distance_to(target.global_position))
        target.global_position = new_pos
    else:
        target.global_position = new_pos
    
    target.global_rotation = new_rot

func add_snapshot(position: Vector3, rotation: Vector3) -> void:
    var snapshot := {
        "time": Time.get_ticks_msec(),
        "position": position,
        "rotation": rotation,
    }
    
    _position_buffer.append(snapshot)
    
    # Remove old snapshots
    while _position_buffer.size() > _buffer_size:
        _position_buffer.pop_front()
    
    # Remove future snapshots (shouldn't happen but safety)
    var current_time := Time.get_ticks_msec()
    _position_buffer = _position_buffer.filter(func(s): return s["time"] <= current_time)

func _get_snapshots_for_time(time_ms: int) -> Tuple:
    var before: Dictionary = {}
    var after: Dictionary = {}
    
    for i in range(_position_buffer.size()):
        var snap := _position_buffer[i]
        
        if snap["time"] <= time_ms:
            before = snap
        elif snap["time"] > time_ms:
            after = snap
            break
    
    return Tuple.new(before, after)

class_name Tuple
extends RefCounted
var first
var second
func _init(a, b): first = a; second = b
```

### Synchronizer Configuration

```gdscript
# Setup MultiplayerSynchronizer on a node
# In _ready() of your player scene:

func _setup_synchronizer() -> void:
    var synchronizer := MultiplayerSynchronizer.new()
    synchronizer.name = "PositionSynchronizer"
    
    # What to sync (these become RPCs automatically)
    synchronizer.set_visibility_for(
        multiplayer.get_unique_id(),  # Only sync to specific peer
        true
    )
    
    # Path to property, RPC mode, sync rate
    synchronizer.add_property(
        ".",  # Self
        &"global_position",
        MultiplayerSynchronizer.RPC_MODE_PEER_SERVER,
        20  # Hz
    )
    
    synchronizer.add_property(
        ".",
        &"global_rotation",
        MultiplayerSynchronizer.RPC_MODE_PEER_SERVER,
        10
    )
    
    add_child(synchronizer)
```

---

## Phase 4: Server Authority

### Server Game State

```gdscript
# ServerGameState.gd - Authoritative game state manager
class_name ServerGameState
extends Node

signal state_changed(property: StringName, value: Variant)
signal game_event(event_type: String, data: Dictionary)

var _game_state: Dictionary = {}
var _client_states: Dictionary = {}  # peer_id -> client state

func _ready() -> void:
    assert(multiplayer.is_server(), "ServerGameState must run on server!")
    _init_game_state()

func _init_game_state() -> void:
    _game_state = {
        "phase": "lobby",  # lobby, playing, ended
        "round": 0,
        "time_remaining": 0.0,
        "score": {},
        "entities": {},
    }

# ============ STATE QUERY ============

func get_state() -> Dictionary:
    return _game_state.duplicate(true)

func get_entity_state(entity_id: StringName) -> Dictionary:
    return _game_state["entities"].get(entity_id, {})

# ============ STATE MODIFICATION ============

func update_entity(entity_id: StringName, updates: Dictionary) -> void:
    if not _game_state["entities"].has(entity_id):
        _game_state["entities"][entity_id] = {}
    
    for key in updates:
        _game_state["entities"][entity_id][key] = updates[key]
    
    # Broadcast update to all clients
    sync_entity_state.rpc(
        entity_id,
        _game_state["entities"][entity_id]
    )

func damage_entity(entity_id: StringName, damage: float, source_peer_id: int) -> bool:
    var entity := _game_state["entities"].get(entity_id, {})
    if entity.is_empty():
        return false
    
    var health := entity.get("health", 100.0)
    health = maxf(0.0, health - damage)
    
    update_entity(entity_id, {"health": health})
    
    if health <= 0:
        _on_entity_killed(entity_id, source_peer_id)
    
    return true

func _on_entity_killed(entity_id: StringName, killer_peer_id: int) -> void:
    # Update score
    var scores := _game_state["score"]
    scores[killer_peer_id] = scores.get(killer_peer_id, 0) + 1
    update_game_state({"score": scores})
    
    # Emit game event
    game_event.emit("entity_killed", {
        "entity_id": entity_id,
        "killer_id": killer_peer_id,
        "timestamp": Time.get_ticks_msec(),
    })

# ============ CLIENT RPC HANDLERS ============

@rpc("any_peer", "call_local", "reliable")
func request_damage_entity(entity_id: StringName, damage: float) -> void:
    if not multiplayer.is_server():
        return
    
    var sender_id := multiplayer.get_remote_sender_id()
    
    # SERVER VALIDATION: Check if sender can damage this entity
    if not _can_player_damage(sender_id, entity_id, damage):
        # Cheat detection: Log suspicious activity
        _log_suspicious_activity(sender_id, "invalid_damage_request", {
            "entity": entity_id,
            "damage": damage,
        })
        return
    
    damage_entity(entity_id, damage, sender_id)

@rpc("any_peer", "call_local", "reliable")
func request_use_ability(ability_id: StringName, target_position: Vector3) -> void:
    if not multiplayer.is_server():
        return
    
    var sender_id := multiplayer.get_remote_sender_id()
    
    # Validate ability use
    if not _validate_ability_use(sender_id, ability_id, target_position):
        _log_suspicious_activity(sender_id, "invalid_ability_request", {
            "ability": ability_id,
            "target": target_position,
        })
        return
    
    # Apply ability effects
    _apply_ability(ability_id, sender_id, target_position)

func _can_player_damage(player_id: int, entity_id: StringName, damage: float) -> bool:
    # Range check
    var player_pos := get_entity_state(str(player_id)).get("position", Vector3.ZERO)
    var entity_pos := get_entity_state(entity_id).get("position", Vector3.ZERO)
    
    var distance := player_pos.distance_to(entity_pos)
    var max_range := 100.0  # From ability config
    
    if distance > max_range:
        return false
    
    # Cooldown check
    var last_attack := _client_states.get(player_id, {}).get("last_attack_time", 0)
    var now := Time.get_ticks_msec()
    
    if now - last_attack < 500:  # 500ms cooldown
        return false
    
    # Update client state
    if not _client_states.has(player_id):
        _client_states[player_id] = {}
    _client_states[player_id]["last_attack_time"] = now
    
    return true

func _validate_ability_use(player_id: int, ability_id: StringName, target: Vector3) -> bool:
    # Check if player has ability unlocked
    var player_data := _client_states.get(player_id, {})
    var unlocked_abilities: Array = player_data.get("abilities", [])
    
    if not ability_id in unlocked_abilities:
        return false
    
    # Check cooldown
    var cooldowns: Dictionary = player_data.get("cooldowns", {})
    var cooldown_end := cooldowns.get(ability_id, 0)
    
    if Time.get_ticks_msec() < cooldown_end:
        return false
    
    return true

func _apply_ability(ability_id: StringName, caster_id: int, target: Vector3) -> void:
    # Authoritative ability application
    var ability_config := _get_ability_config(ability_id)
    
    # Update cooldowns
    var cooldowns: Dictionary = _client_states.get(caster_id, {}).get("cooldowns", {})
    cooldowns[ability_id] = Time.get_ticks_msec() + ability_config["cooldown_ms"]
    
    # Apply effects (damage, buffs, etc.)
    match ability_config["type"]:
        "damage":
            for entity_id in _get_entities_in_radius(target, ability_config["radius"]):
                damage_entity(entity_id, ability_config["damage"], caster_id)
        "heal":
            var target_player := str(caster_id)  # Self-heal for now
            heal_entity(target_player, ability_config["heal_amount"])
    
    # Broadcast ability use
    broadcast_ability_use.rpc(ability_id, caster_id, target)

@rpc("authority", "call_local", "reliable")
func sync_entity_state(entity_id: StringName, state: Dictionary) -> void:
    # Client receives authoritative state update
    # Apply to local entity representation
    pass

@rpc("authority", "call_local", "reliable")
func broadcast_ability_use(ability_id: StringName, caster_id: int, target: Vector3) -> void:
    # Clients play VFX/SFX for ability
    pass

# ============ ANTI-CHEAT HELPERS ============

func _log_suspicious_activity(peer_id: int, reason: String, details: Dictionary) -> void:
    print("Suspicious activity from peer %d: %s - %s" % [peer_id, reason, JSON.stringify(details)])
    
    # Could integrate with anti-cheat service
    AntiCheatManager.log_event(peer_id, reason, details)
```

---

## Phase 5: Client Prediction

### Input Buffer & Prediction

```gdscript
# InputBuffer.gd - Buffer client inputs for reconciliation
class_name InputBuffer
extends Node

@export var buffer_size: int = 128

var _buffer: Array[Dictionary] = []
var _last_processed_input: int = -1

func add_input(input: Dictionary) -> void:
    input["sequence"] = _buffer.size()
    _buffer.append(input)
    
    # Remove old inputs
    while _buffer.size() > buffer_size:
        _buffer.pop_front()

func get_inputs_since(last_processed: int) -> Array[Dictionary]:
    return _buffer.filter(func(i): return i["sequence"] > last_processed)

func get_input_at_sequence(seq: int) -> Dictionary:
    for input in _buffer:
        if input["sequence"] == seq:
            return input
    return {}

func mark_processed(seq: int) -> void:
    _last_processed_input = seq
    # Remove inputs that server has acknowledged
    _buffer = _buffer.filter(func(i): return i["sequence"] > seq)

func clear() -> void:
    _buffer.clear()
    _last_processed_input = -1
```

### PredictionManager

```gdscript
# PredictionManager.gd - Client-side prediction with reconciliation
class_name PredictionManager
extends Node

signal prediction_corrected(corrected_position: Vector3)
signal reconciliation_performed(server_state: Dictionary)

@export var character: CharacterBody3D
@export var input_buffer: InputBuffer
@export var reconciliation_threshold: float = 0.1

var _predicted_state: Dictionary = {
    "position": Vector3.ZERO,
    "velocity": Vector3.ZERO,
    "rotation": Vector3.ZERO,
}
var _input_sequence: int = 0

func _physics_process(delta: float) -> void:
    if not character.has_multiplayer_authority():
        return
    
    # Gather input
    var input := _gather_input()
    
    # Add sequence number
    input["sequence"] = _input_sequence
    _input_sequence += 1
    
    # Buffer input
    input_buffer.add_input(input)
    
    # Predict locally
    _apply_input_predictively(input, delta)
    
    # Send to server
    send_input.rpc_id(1, input)

func _gather_input() -> Dictionary:
    return {
        "forward": Input.is_action_pressed("move_forward"),
        "backward": Input.is_action_pressed("move_backward"),
        "left": Input.is_action_pressed("move_left"),
        "right": Input.is_action_pressed("move_right"),
        "jump": Input.is_action_pressed("jump"),
        "attack": Input.is_action_pressed("attack"),
        "timestamp": Time.get_ticks_msec(),
    }

func _apply_input_predictively(input: Dictionary, delta: float) -> void:
    var move_dir := Vector3.ZERO
    
    if input["forward"]:
        move_dir.z -= 1
    if input["backward"]:
        move_dir.z += 1
    if input["left"]:
        move_dir.x -= 1
    if input["right"]:
        move_dir.x += 1
    
    if move_dir != Vector3.ZERO:
        move_dir = move_dir.normalized()
    
    # Apply movement
    var speed := 10.0
    var velocity := move_dir * speed
    velocity.y = character.velocity.y  # Preserve gravity
    
    if input["jump"] and character.is_on_floor():
        velocity.y = 5.0
    
    character.velocity = velocity
    character.move_and_slide()
    
    # Store predicted state
    _predicted_state["position"] = character.global_position
    _predicted_state["velocity"] = character.velocity
    _predicted_state["rotation"] = character.global_rotation

@rpc("any_peer", "call_local", "unreliable")
func send_input(input: Dictionary) -> void:
    # Server receives and processes
    if not multiplayer.is_server():
        return
    
    var sender_id := multiplayer.get_remote_sender_id()
    
    # Process input on server
    var server_result := _process_input_server(sender_id, input)
    
    # Send correction back to client
    reconcile_state.rpc_id(sender_id, server_result)

@rpc("authority", "call_local", "reliable")
func reconcile_state(server_state: Dictionary) -> void:
    # Compare server state with predicted state
    var server_pos: Vector3 = server_state["position"]
    var predicted_pos: Vector3 = _predicted_state["position"]
    var error := server_pos.distance_to(predicted_pos)
    
    if error > reconciliation_threshold:
        print("Reconciliation: %.2f error, correcting from %s to %s" % [
            error, predicted_pos, server_pos
        ])
        
        # Correct position
        character.global_position = server_pos
        
        # Re-apply all inputs since last acknowledged
        var last_acked := server_state.get("last_input_sequence", -1)
        var unacked_inputs := input_buffer.get_inputs_since(last_acked)
        
        for input in unacked_inputs:
            _apply_input_predictively(input, 1.0 / 60.0)
        
        prediction_corrected.emit(server_pos)
    else:
        # Prediction was correct, discard acknowledged inputs
        var last_acked := server_state.get("last_input_sequence", -1)
        input_buffer.mark_processed(last_acked)
    
    reconciliation_performed.emit(server_state)

func _process_input_server(player_id: int, input: Dictionary) -> Dictionary:
    # Server-side physics simulation
    var player := get_player(player_id)
    if not player:
        return {}
    
    # Apply input (same logic as client)
    var move_dir := Vector3.ZERO
    if input["forward"]:
        move_dir.z -= 1
    # ... (same as client)
    
    player.move_and_slide()
    
    return {
        "position": player.global_position,
        "velocity": player.velocity,
        "rotation": player.global_rotation,
        "last_input_sequence": input["sequence"],
    }

func get_player(player_id: int) -> Node:
    # Get player node from scene
    return get_tree().get_node("Players/%d" % player_id)
```

---

## Phase 6: Lobby & Matchmaking

### LobbyManager

```gdscript
# LobbyManager.gd - Lobby state machine
class_name LobbyManager
extends Node

signal player_joined(peer_id: int, data: PlayerData)
signal player_left(peer_id: int)
signal player_ready_changed(peer_id: int, ready: bool)
signal game_start_countdown(seconds: int)
signal game_started()

enum LobbyState {
    IDLE,           # No lobby
    CREATING,      # Creating room
    WAITING,       # Waiting for players
    COUNTDOWN,     # Countdown to game start
    STARTING,      # Game is starting
}

var state: LobbyState = LobbyState.IDLE
var players: Dictionary = {}  # peer_id -> PlayerData
var is_host: bool:
    return NetworkManager.local_peer_id == _get_host_id()

var _get_host_id: Callable

func _ready() -> void:
    NetworkManager.player_connected.connect(_on_player_connected)
    NetworkManager.player_disconnected.connect(_on_player_disconnected)

func create_lobby(settings: Dictionary, host_check_func: Callable) -> bool:
    if not NetworkManager.is_server:
        return false
    
    _get_host_id = host_check_func
    state = LobbyState.WAITING
    
    # Add host to players
    var host_data := PlayerData.new()
    host_data.peer_id = NetworkManager.local_peer_id
    host_data.display_name = settings.get("host_name", "Host")
    host_data.ready = true
    players[NetworkManager.local_peer_id] = host_data
    
    broadcast_lobby_state.rpc()
    return true

func join_lobby(peer_id: int, player_data: Dictionary) -> bool:
    if state != LobbyState.WAITING:
        return false
    
    var data := PlayerData.new()
    data.from_dict(player_data)
    data.peer_id = peer_id
    data.ready = false
    players[peer_id] = data
    
    broadcast_lobby_state.rpc()
    player_joined.emit(peer_id, data)
    return true

func set_player_ready(peer_id: int, ready: bool) -> void:
    if not players.has(peer_id):
        return
    
    players[peer_id].ready = ready
    player_ready_changed.emit(peer_id, ready)
    
    if NetworkManager.is_server:
        broadcast_lobby_state.rpc()
    
    # Check if all players ready
    _check_all_ready()

func _check_all_ready() -> void:
    if not players.values().all(func(p): return p.ready):
        return
    
    # All ready - start countdown
    _start_countdown()

func _start_countdown() -> void:
    state = LobbyState.COUNTDOWN
    
    var countdown := 3
    for i in range(countdown, 0, -1):
        game_start_countdown.emit(i)
        await get_tree().create_timer(1.0).timeout
    
    _start_game()

func _start_game() -> void:
    state = LobbyState.STARTING
    game_started.emit()
    
    # Transition to gameplay scene
    get_tree().change_scene_to_packed(load("res://scenes/Game.tscn"))

func leave_lobby() -> void:
    var peer_id := NetworkManager.local_peer_id
    players.erase(peer_id)
    
    if NetworkManager.is_server:
        notify_player_left.rpc_id(peer_id, "Left lobby")
    
    players.clear()
    state = LobbyState.IDLE

func _on_player_connected(peer_id: int) -> void:
    if state == LobbyState.WAITING:
        # Send current lobby state to new player
        send_lobby_state.rpc_id(peer_id, _get_lobby_state_dict())

func _on_player_disconnected(peer_id: int) -> void:
    if players.has(peer_id):
        players.erase(peer_id)
        player_left.emit(peer_id)
        
        if NetworkManager.is_server:
            broadcast_lobby_state.rpc()

# ============ NETWORK SYNC ============

@rpc("authority", "call_local", "reliable")
func broadcast_lobby_state() -> void:
    if NetworkManager.is_server:
        return
    # Server sends state, clients receive
    pass

@rpc("authority", "call_local", "reliable")
func send_lobby_state(state_dict: Dictionary) -> void:
    # Receive full lobby state
    _apply_lobby_state(state_dict)

func _get_lobby_state_dict() -> Dictionary:
    return {
        "state": state,
        "players": players.map(func(_, p): return p.to_dict()),
    }

func _apply_lobby_state(state_dict: Dictionary) -> void:
    state = state_dict["state"]
    players.clear()
    for p_dict in state_dict["players"]:
        var data := PlayerData.new()
        data.from_dict(p_dict)
        players[data.peer_id] = data

@rpc("any_peer", "call_local", "reliable")
func request_ready_toggle() -> void:
    if not multiplayer.is_server():
        return
    
    var sender_id := multiplayer.get_remote_sender_id()
    if players.has(sender_id):
        var new_ready := not players[sender_id].ready
        set_player_ready(sender_id, new_ready)
```

### PlayerData Resource

```gdscript
# PlayerData.gd - Player information resource
class_name PlayerData
extends Resource

@export var peer_id: int = 0
@export var display_name: String = "Player"
@export var ready: bool = false
@export var selected_character: int = 0
@export var stats: Dictionary = {}

func _init() -> void:
    stats = {
        "kills": 0,
        "deaths": 0,
        "assists": 0,
        "ping": 0,
    }

func to_dict() -> Dictionary:
    return {
        "peer_id": peer_id,
        "display_name": display_name,
        "ready": ready,
        "selected_character": selected_character,
        "stats": stats,
    }

func from_dict(dict: Dictionary) -> void:
    peer_id = dict.get("peer_id", 0)
    display_name = dict.get("display_name", "Player")
    ready = dict.get("ready", false)
    selected_character = dict.get("selected_character", 0)
    stats = dict.get("stats", {})
```

---

## Anti-Pattern Watchlist

| Anti-Pattern | Why It Fails | Correct Approach |
|--------------|--------------|------------------|
| Trusting client position/health | Easy to hack, breaks fairness | Server authoritative, client just visual |
| `@rpc("any_peer")` without validation | Cheaters can fake anything | Validate every RPC server-side |
| `reliable` for position updates | Unnecessary bandwidth, latency | Use `unreliable_ordered` for positions |
| No interpolation for remote players | Teleporting/jerky movement | Buffer + interpolate remote states |
| Syncing every property every frame | Bandwidth explosion | Sync at appropriate rates (20Hz positions, 1Hz health) |
| No lag compensation | Hits don't register | Server rewinds time for hit detection |
| Missing reconnection handling | Players lose progress on DC | Store state, allow rejoin within window |

---

## Execution Checklist

### Phase 1: Network Foundation
- [ ] Transport selected (ENet/WebSocket/WebRTC)
- [ ] NetworkManager singleton implemented
- [ ] Connection/disconnection handling
- [ ] Latency monitoring
- [ ] Server/client startup flows

### Phase 2: Authority & Spawning
- [ ] MultiplayerSpawner configured
- [ ] Player scene with authority setup
- [ ] Spawn point management
- [ ] Authority transfer handling
- [ ] Visual interpolation for remote players

### Phase 3: State Sync
- [ ] MultiplayerSynchronizer per entity type
- [ ] Transform sync (position, rotation)
- [ ] Custom property sync (health, ammo, etc.)
- [ ] Network interpolation implemented
- [ ] Bandwidth optimization (unreliable vs reliable)

### Phase 4: Server Authority
- [ ] ServerGameState singleton
- [ ] Server-validated RPCs
- [ ] Input validation
- [ ] Anti-cheat logging
- [ ] Game event broadcasting

### Phase 5: Client Prediction
- [ ] Input buffering implemented
- [ ] PredictionManager with local simulation
- [ ] Server reconciliation
- [ ] Prediction correction handling
- [ ] Movement feels responsive

### Phase 6: Lobby
- [ ] LobbyManager state machine
- [ ] PlayerData resource
- [ ] Ready system
- [ ] Countdown flow
- [ ] Game start transition
- [ ] Disconnection handling

### Performance
- [ ] Bandwidth profiling completed
- [ ] Tick rate optimized per game type
- [ ] Remote player interpolation tuned
- [ ] Stress tested with bots
