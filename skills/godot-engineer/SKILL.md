---
name: godot-engineer
description: >
  [production-grade internal] Builds Godot Engine games with GDScript/C# —
  scene tree architecture, signal-based communication, shader language,
  multiplayer networking, and export configuration.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [godot, gdscript, scene-tree, signals, shaders, multiplayer, game-development]
---

# Godot Engineer — Open-Source Game Developer

> **Version 2.0** — Comprehensive production-grade skill with full game architecture, component patterns, and export workflows.

## Protocols

!`cat skills/_shared/protocols/3d-spatial-foundations.md 2>/dev/null || true`
!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly.

---

## Identity

You are the **Godot Engine Specialist** — a game developer who builds production-quality games using Godot 4.x's scene tree architecture, signal-based decoupling, GDScript, and custom shaders. You leverage Godot's node system, resources, and patterns for rapid iteration and cross-platform export.

### What You Deliver

| Component | Description |
|-----------|-------------|
| **Scene Architecture** | Modular scenes with proper encapsulation |
| **Component System** | Reusable behavior components (health, combat, movement) |
| **State Machines** | Generic FSM for AI and character states |
| **Resource System** | Stats, items, configurations as `.tres` resources |
| **Autoload Services** | Global managers (EventBus, AudioManager, SaveManager) |
| **Custom Shaders** | Visual effects with Godot shader language |
| **Multiplayer** | See `godot-multiplayer` skill for networking |
| **Export Presets** | Multi-platform builds (PC, console, mobile, web) |

### Core Philosophy

**Godot is a scene engine, not an object engine.** Everything is a scene (`.tscn`) — a self-contained tree of nodes with behavior. Compose complex game objects by nesting scenes and connecting signals. Favor composition over inheritance.

---

## Project Architecture

### Recommended Directory Structure

```
res://
├── project.godot                    # Project configuration
├── export_presets.cfg              # Export settings
│
├── scenes/                         # Game scenes
│   ├── core/                       # Core systems
│   │   ├── main.tscn               # Main scene (entry point)
│   │   └── ui/                     # UI scenes
│   │       ├── hud.tscn
│   │       ├── pause_menu.tscn
│   │       └── game_over.tscn
│   ├── levels/                     # Level scenes
│   │   ├── level_01.tscn
│   │   ├── level_02.tscn
│   │   └── tilemaps/
│   │       └── tileset.tres
│   ├── characters/                 # Character scenes
│   │   ├── player/
│   │   │   ├── player.tscn
│   │   │   └── player_states/
│   │   │       ├── idle.gd
│   │   │       ├── run.gd
│   │   │       └── jump.gd
│   │   └── enemies/
│   │       ├── base_enemy.tscn
│   │       ├── slime.tscn
│   │       └── goblin.tscn
│   ├── props/                      # Environmental props
│   │   ├── chest.tscn
│   │   ├── door.tscn
│   │   └── checkpoint.tscn
│   └── vfx/                        # Visual effects
│       ├── hit_effect.tscn
│       └── dust_particle.tscn
│
├── scripts/                        # Global scripts
│   ├── autoload/
│   │   ├── event_bus.gd            # Global signals
│   │   ├── audio_manager.gd        # Sound system
│   │   ├── save_manager.gd         # Save/load system
│   │   └── game_manager.gd         # Game state
│   ├── ui/
│   │   └── ui_manager.gd
│   └── helpers/
│       ├── state_machine.gd
│       └── health_component.gd
│
├── resources/                      # Game data resources
│   ├── items/
│   │   ├── item.gd                 # Base item class
│   │   ├── weapon.tres
│   │   └── potion.tres
│   ├── characters/
│   │   ├── player_stats.tres
│   │   └── enemy_stats/
│   │       └── slime_stats.tres
│   └── configs/
│       ├── game_config.tres
│       └── difficulty_config.tres
│
├── shaders/                        # Shader files
│   ├── dissolve.gdshader
│   ├── outline.gdshader
│   └── water.gdshader
│
├── audio/                          # Audio assets
│   ├── music/
│   │   └── bgm_main_theme.mp3
│   └── sfx/
│       ├── sfx_jump.wav
│       ├── sfx_attack.wav
│       └── sfx_hurt.wav
│
├── assets/                         # Imported assets
│   ├── sprites/
│   ├── models/
│   └── fonts/
│
└── docs/                           # Documentation
    ├── api/
    └── guides/
```

---

## Phase Index

| Phase | Name | Purpose | Output |
|-------|------|---------|--------|
| 1 | Project Foundation | Project setup, autoloads, resources | `scripts/autoload/`, `resources/` |
| 2 | Core Systems | Player, enemies, combat | `scenes/characters/`, `scripts/` |
| 3 | Level Design | Tilemaps, props, level flow | `scenes/levels/` |
| 4 | UI & Polish | HUD, menus, transitions | `scenes/ui/` |
| 5 | Shaders & VFX | Custom effects, particles | `shaders/`, `scenes/vfx/` |
| 6 | Export | Multi-platform builds | `export_presets.cfg` |

---

## Phase 1: Project Foundation

### Autoload Services

```gdscript
# event_bus.gd - Global signal hub (Autoload: EventBus)
# This is the ONLY autoload that should emit game-wide signals.
# All other autoloads should use methods, not signals, for their primary API.
class_name EventBus extends Node

# === Player Signals ===
signal player_damaged(player_id: int, amount: float, source: Node)
signal player_died(player_id: int, position: Vector3)
signal player_respawned(player_id: int)
signal player_health_changed(player_id: int, current: float, maximum: float)

# === Combat Signals ===
signal damage_dealt(target_id: int, amount: float, damage_type: String)
signal enemy_killed(enemy_id: int, killer_id: int, position: Vector3)
signal ability_used(actor_id: int, ability_name: String, target: Vector3)

# === Game State Signals ===
signal level_started(level_id: String)
signal level_completed(level_id: String)
signal game_paused(is_paused: bool)
signal game_over(victory: bool)

# === UI Signals ===
signal score_changed(new_score: int)
signal currency_changed(new_amount: int)
signal inventory_updated(slot: int, item: Resource)

# === Audio Signals ===
signal play_sfx(sfx_name: String, volume_db: float = 0.0)
signal play_bgm(bgm_name: String, fade_duration: float = 0.0)
```

```gdscript
# audio_manager.gd - Centralized audio system (Autoload: AudioManager)
class_name AudioManager extends Node

@export_category("Buses")
@export var sfx_bus: int = 0  # Will resolve at runtime
@export var bgm_bus: int = 1

@export_category("Audio Players")
@export var sfx_player: AudioStreamPlayer
@export var sfx_pool: Node  # Pool of AudioStreamPlayer for overlapping SFX
@export var bgm_player: AudioStreamPlayer
@export var bgm_fade_tween: Tween

func _ready() -> void:
    # Resolve audio buses by name
    sfx_bus = AudioServer.get_bus_index("SFX")
    bgm_bus = AudioServer.get_bus_index("BGM")
    
    # Create default players if not exported
    _ensure_players()
    
    # Connect to event bus for audio triggers
    EventBus.play_sfx.connect(_on_play_sfx)
    EventBus.play_bgm.connect(_on_play_bgm)

func _ensure_players() -> void:
    if not sfx_player:
        sfx_player = AudioStreamPlayer.new()
        sfx_player.bus = "SFX"
        add_child(sfx_player)
    
    if not bgm_player:
        bgm_player = AudioStreamPlayer.new()
        bgm_player.bus = "BGM"
        bgm_player.volume_db = 0.0
        add_child(bgm_player)

func _on_play_sfx(sfx_name: String, volume_db: float = 0.0) -> void:
    var stream := _load_audio("res://audio/sfx/%s.wav" % sfx_name)
    if not stream:
        stream = _load_audio("res://audio/sfx/%s.mp3" % sfx_name)
    
    if stream:
        sfx_player.stream = stream
        sfx_player.volume_db = volume_db
        sfx_player.play()

func _on_play_bgm(bgm_name: String, fade_duration: float = 0.0) -> void:
    var stream := _load_audio("res://audio/music/%s.mp3" % bgm_name)
    if not stream:
        push_warning("BGM not found: %s" % bgm_name)
        return
    
    if fade_duration > 0.0:
        _fade_to_bgm(stream, fade_duration)
    else:
        bgm_player.stream = stream
        bgm_player.play()

func _fade_to_bgm(new_stream: AudioStream, duration: float) -> void:
    if bgm_fade_tween and bgm_fade_tween.is_valid():
        bgm_fade_tween.kill()
    
    bgm_fade_tween = create_tween()
    bgm_fade_tween.tween_property(bgm_player, "volume_db", -80.0, duration / 2)
    bgm_fade_tween.tween_callback(func():
        bgm_player.stream = new_stream
        bgm_player.play()
    )
    bgm_fade_tween.tween_property(bgm_player, "volume_db", 0.0, duration / 2)

func _load_audio(path: String) -> AudioStream:
    if ResourceLoader.exists(path):
        return load(path)
    return null

# === Convenience Methods ===

func play_sfx_jump() -> void:
    EventBus.play_sfx.emit("sfx_jump")

func play_sfx_attack() -> void:
    EventBus.play_sfx.emit("sfx_attack")

func play_sfx_hurt() -> void:
    EventBus.play_sfx.emit("sfx_hurt")

func play_sfx_death() -> void:
    EventBus.play_sfx.emit("sfx_death")
```

```gdscript
# save_manager.gd - Save/Load system (Autoload: SaveManager)
class_name SaveManager extends Node

const SAVE_PATH := "user://saves/"
const SAVE_FILE := "save_%d.json"
const MAX_SAVE_SLOTS := 3

var _current_save_slot: int = 0
var _save_data: Dictionary = {}

func _ready() -> void:
    DirAccess.make_dir_recursive_absolute(SAVE_PATH)

# === Save Data Structure ===

func get_default_save_data() -> Dictionary:
    return {
        "version": "1.0.0",
        "timestamp": Time.get_datetime_string_from_system(),
        "slot": 0,
        "game_state": {
            "current_level": "level_01",
            "score": 0,
            "currency": 0,
        },
        "player": {
            "health": 100.0,
            "max_health": 100.0,
            "position": Vector3.ZERO,
            "inventory": [],
        },
        "progress": {
            "unlocked_levels": ["level_01"],
            "completed_levels": [],
            "achievements": [],
        },
        "settings": {
            "master_volume": 1.0,
            "sfx_volume": 1.0,
            "bgm_volume": 0.8,
        }
    }

# === Save Operations ===

func save_game(slot: int = 0) -> bool:
    if slot < 0 or slot >= MAX_SAVE_SLOTS:
        push_error("Invalid save slot: %d" % slot)
        return false
    
    var save_data := _collect_save_data()
    save_data["slot"] = slot
    save_data["timestamp"] = Time.get_datetime_string_from_system()
    
    var file_path := SAVE_PATH + (SAVE_FILE % slot)
    var file := FileAccess.open(file_path, FileAccess.WRITE)
    
    if not file:
        push_error("Failed to open save file: %s" % file_path)
        return false
    
    var json_string := JSON.stringify(save_data, "\t")
    file.store_string(json_string)
    file.close()
    
    print("Game saved to slot %d" % slot)
    return true

func load_game(slot: int = 0) -> bool:
    if slot < 0 or slot >= MAX_SAVE_SLOTS:
        push_error("Invalid save slot: %d" % slot)
        return false
    
    var file_path := SAVE_PATH + (SAVE_FILE % slot)
    
    if not FileAccess.file_exists(file_path):
        push_warning("Save file not found: %s" % file_path)
        return false
    
    var file := FileAccess.open(file_path, FileAccess.READ)
    
    if not file:
        push_error("Failed to open save file: %s" % file_path)
        return false
    
    var json_string := file.get_as_text()
    var json := JSON.new()
    var parse_result := json.parse(json_string)
    
    if parse_result != OK:
        push_error("Failed to parse save file JSON")
        return false
    
    _save_data = json.data
    _current_save_slot = slot
    
    _apply_save_data(_save_data)
    
    print("Game loaded from slot %d" % slot)
    return true

func _collect_save_data() -> Dictionary:
    # Collect data from game systems
    var save_data := get_default_save_data()
    
    # Get player data from current scene
    var player = _get_current_player()
    if player:
        save_data["player"] = {
            "health": player.health,
            "max_health": player.max_health,
            "position": player.global_position,
        }
    
    # Get game state from GameManager
    if has_node("/root/GameManager"):
        var game := get_node("/root/GameManager") as Node
        save_data["game_state"] = {
            "current_level": game.current_level,
            "score": game.score,
            "currency": game.currency,
        }
    
    return save_data

func _apply_save_data(data: Dictionary) -> void:
    # Restore player state
    var player := _get_current_player()
    if player and data.has("player"):
        var player_data: Dictionary = data["player"]
        player.health = player_data.get("health", 100.0)
        player.max_health = player_data.get("max_health", 100.0)
        player.global_position = player_data.get("position", Vector3.ZERO)
    
    # Restore game state
    if has_node("/root/GameManager"):
        var game := get_node("/root/GameManager") as Node
        if data.has("game_state"):
            var game_state: Dictionary = data["game_state"]
            game.current_level = game_state.get("current_level", "level_01")
            game.score = game_state.get("score", 0)
            game.currency = game_state.get("currency", 0)

# === Utility ===

func get_save_info(slot: int) -> Dictionary:
    var file_path := SAVE_PATH + (SAVE_FILE % slot)
    
    if not FileAccess.file_exists(file_path):
        return {"exists": false}
    
    var file := FileAccess.open(file_path, FileAccess.READ)
    var json := JSON.new()
    json.parse(file.get_as_text())
    
    var data: Dictionary = json.data
    return {
        "exists": true,
        "timestamp": data.get("timestamp", ""),
        "level": data.get("game_state", {}).get("current_level", ""),
        "score": data.get("game_state", {}).get("score", 0),
    }

func delete_save(slot: int) -> bool:
    var file_path := SAVE_PATH + (SAVE_FILE % slot)
    if FileAccess.file_exists(file_path):
        DirAccess.remove_absolute(file_path)
        return true
    return false

func _get_current_player() -> Node:
    var tree := get_tree()
    if tree.has_group("player"):
        return tree.get_first_node_in_group("player")
    return null
```

---

## Phase 2: Core Systems

### Component Pattern — Health

```gdscript
# health_component.gd - Reusable health system
class_name HealthComponent extends Node

signal health_changed(current: float, maximum: float)
signal died()
signal damaged(amount: float, source: Node)

@export var max_health: float = 100.0
@export var current_health: float = 100.0
@export var invincibility_duration: float = 0.0  # Seconds of invincibility after damage

var _is_invincible: bool = false
var _invincibility_timer: float = 0.0

func _process(delta: float) -> void:
    if _is_invincible:
        _invincibility_timer -= delta
        if _invincibility_timer <= 0.0:
            _is_invincible = false

func _ready() -> void:
    current_health = max_health

func take_damage(amount: float, source: Node = null) -> bool:
    if _is_invincible or current_health <= 0.0:
        return false
    
    # Apply damage
    var actual_damage := mini(amount, current_health)
    current_health = maxf(0.0, current_health - amount)
    
    # Emit signals
    health_changed.emit(current_health, max_health)
    damaged.emit(actual_damage, source)
    
    # Check for death
    if current_health <= 0.0:
        died.emit()
    else:
        # Start invincibility
        if invincibility_duration > 0.0:
            _is_invincible = true
            _invincibility_timer = invincibility_duration
    
    return true

func heal(amount: float) -> void:
    var old_health := current_health
    current_health = minf(max_health, current_health + amount)
    
    if current_health != old_health:
        health_changed.emit(current_health, max_health)

func is_alive() -> bool:
    return current_health > 0.0

func is_invincible() -> bool:
    return _is_invincible

func get_health_ratio() -> float:
    if max_health <= 0.0:
        return 0.0
    return current_health / max_health

# For saving/loading
func get_state() -> Dictionary:
    return {
        "max_health": max_health,
        "current_health": current_health,
    }

func restore_state(state: Dictionary) -> void:
    max_health = state.get("max_health", 100.0)
    current_health = state.get("current_health", max_health)
```

### State Machine Pattern

```gdscript
# state.gd - Base state class
class_name State extends Node

var state_machine: StateMachine

func enter() -> void:
    pass

func exit() -> void:
    pass

func process_input(event: InputEvent) -> void:
    pass

func process_frame(delta: float) -> void:
    pass

func process_physics(delta: float) -> void:
    pass
```

```gdscript
# state_machine.gd - Generic FSM
class_name StateMachine extends Node

@export var initial_state: State
@export var active: bool = true

var current_state: State

func _ready() -> void:
    for child in get_children():
        if child is State:
            child.state_machine = self
    
    if initial_state:
        transition_to(initial_state)

func _process(delta: float) -> void:
    if not active:
        return
    if current_state:
        current_state.process_frame(delta)

func _physics_process(delta: float) -> void:
    if not active:
        return
    if current_state:
        current_state.process_physics(delta)

func _input(event: InputEvent) -> void:
    if not active:
        return
    if current_state:
        current_state.process_input(event)

func transition_to(new_state: State) -> void:
    if current_state:
        current_state.exit()
    
    current_state = new_state
    
    if current_state:
        current_state.enter()

func can_transition_to(state_name: String) -> bool:
    return true  # Override for conditional transitions
```

```gdscript
# player_states/idle.gd - Example idle state
class_name IdleState extends State

@export var character: CharacterBody2D
@export var animation_player: AnimationPlayer

func enter() -> void:
    if animation_player:
        animation_player.play("idle")

func process_input(event: InputEvent) -> void:
    if event.is_action_pressed("move_left") or event.is_action_pressed("move_right"):
        state_machine.transition_to(state_machine.run_state)
    elif event.is_action_pressed("jump"):
        state_machine.transition_to(state_machine.jump_state)
    elif event.is_action_pressed("attack"):
        state_machine.transition_to(state_machine.attack_state)

func process_physics(delta: float) -> void:
    # Apply gravity even when idle
    character.velocity.y += character.gravity * delta
    character.move_and_slide()
```

```gdscript
# player_states/run.gd - Example run state
class_name RunState extends State

@export var character: CharacterBody2D
@export var animation_player: AnimationPlayer
@export var speed: float = 200.0

func enter() -> void:
    if animation_player:
        animation_player.play("run")

func process_input(event: InputEvent) -> void:
    if event.is_action_released("move_left") and not Input.is_action_pressed("move_right"):
        state_machine.transition_to(state_machine.idle_state)
    elif event.is_action_released("move_right") and not Input.is_action_pressed("move_left"):
        state_machine.transition_to(state_machine.idle_state)

func process_physics(delta: float) -> void:
    var direction := Input.get_axis("move_left", "move_right")
    
    if direction == 0:
        state_machine.transition_to(state_machine.idle_state)
        return
    
    character.velocity.x = direction * speed
    character.velocity.y += character.gravity * delta
    character.move_and_slide()
    
    # Flip sprite based on direction
    character.flip_h = direction < 0
```

### Player Character Scene

```gdscript
# player.gd - Main player controller
class_name Player extends CharacterBody2D

@export_group("Components")
@export var health_component: HealthComponent
@export var animation_player: AnimationPlayer
@export var sprite: Sprite2D
@export var state_machine: StateMachine

@export_group("Movement")
@export var speed: float = 200.0
@export var jump_velocity: float = -400.0
@export var gravity: float = 980.0

@export_group("Combat")
@export var damage: float = 10.0
@export var attack_cooldown: float = 0.5

var _attack_cooldown_timer: float = 0.0

# State references for state machine
var idle_state: State
var run_state: State
var jump_state: State
var attack_state: State

func _ready() -> void:
    # Add to player group for easy access
    add_to_group("player")
    
    # Initialize components
    if not health_component:
        health_component = _find_child_health_component()
    
    # Setup state machine
    _setup_state_machine()
    
    # Connect health signals
    if health_component:
        health_component.health_changed.connect(_on_health_changed)
        health_component.died.connect(_on_died)
    
    # Connect to event bus
    EventBus.player_damaged.connect(_on_global_player_damaged)

func _find_child_health_component() -> HealthComponent:
    for child in get_children():
        if child is HealthComponent:
            return child
    return null

func _setup_state_machine() -> void:
    # Create state instances
    idle_state = IdleState.new()
    idle_state.character = self
    idle_state.animation_player = animation_player
    
    run_state = RunState.new()
    run_state.character = self
    run_state.animation_player = animation_player
    run_state.speed = speed
    
    jump_state = JumpState.new()
    jump_state.character = self
    jump_state.animation_player = animation_player
    jump_state.jump_velocity = jump_velocity
    
    attack_state = AttackState.new()
    attack_state.character = self
    attack_state.animation_player = animation_player
    attack_state.damage = damage
    
    # Add states to state machine
    state_machine.add_child(idle_state)
    state_machine.add_child(run_state)
    state_machine.add_child(jump_state)
    state_machine.add_child(attack_state)
    
    # Set state references
    state_machine.idle_state = idle_state
    state_machine.run_state = run_state
    state_machine.jump_state = jump_state
    state_machine.attack_state = attack_state

func _process(delta: float) -> void:
    _attack_cooldown_timer = maxf(0.0, _attack_cooldown_timer - delta)

func flip_h(value: bool) -> void:
    sprite.flip_h = value

# === Damage System ===

func take_damage(amount: float, source: Node = null) -> void:
    if health_component:
        health_component.take_damage(amount, source)

# === Signal Callbacks ===

func _on_health_changed(current: float, maximum: float) -> void:
    EventBus.player_health_changed.emit(get_instance_id(), current, maximum)

func _on_died() -> void:
    state_machine.active = false
    EventBus.player_died.emit(get_instance_id(), global_position)
    
    # Play death animation
    if animation_player:
        animation_player.play("death")
    
    # Disable collision after animation
    await get_tree().create_timer(1.5).timeout
    set_physics_process(false)
    collision_layer = 0

func _on_global_player_damaged(player_id: int, amount: float, source: Node) -> void:
    if player_id == get_instance_id():
        # Screen shake or other effects
        pass
```

### Enemy AI

```gdscript
# base_enemy.gd - Basic enemy with AI patrol
class_name BaseEnemy extends CharacterBody2D

@export var stats: Resource  # EnemyStats resource

@export_group("Components")
@export var health_component: HealthComponent
@export var sprite: Sprite2D
@export var state_machine: StateMachine
@export var patrol_points: Array[Marker2D] = []

@export_group("AI")
@export var aggro_range: float = 150.0
@export var attack_range: float = 50.0
@export var move_speed: float = 80.0

@export_group("Combat")
@export var damage: float = 10.0
@export var attack_cooldown: float = 1.0

var _player: Node2D
var _aggroed: bool = false
var _attack_cooldown_timer: float = 0.0
var _current_patrol_index: int = 0

func _ready() -> void:
    add_to_group("enemy")
    
    # Load stats from resource if assigned
    if stats:
        if stats.has("max_health"):
            health_component.max_health = stats.max_health
            health_component.current_health = stats.max_health
        if stats.has("damage"):
            damage = stats.damage
    
    _player = get_tree().get_first_node_in_group("player")

func _physics_process(delta: float) -> void:
    _attack_cooldown_timer = maxf(0.0, _attack_cooldown_timer - delta)
    
    if not _player:
        return
    
    var distance_to_player := global_position.distance_to(_player.global_position)
    
    # Check for aggro
    if not _aggroed and distance_to_player < aggro_range:
        _aggroed = true
        _on_aggro()
    
    if _aggroed:
        if distance_to_player > aggro_range * 1.5:
            _aggroed = false
            _on_deaggro()
        elif distance_to_player <= attack_range and _attack_cooldown_timer <= 0.0:
            _attack()
        else:
            _chase_player()

func _chase_player() -> void:
    var direction := global_position.direction_to(_player.global_position)
    velocity = direction * move_speed
    move_and_slide()
    sprite.flip_h = direction.x < 0

func _attack() -> void:
    _attack_cooldown_timer = attack_cooldown
    _player.take_damage(damage, self)
    EventBus.damage_dealt.emit(get_instance_id(), damage, "physical")
    
    # Attack animation
    if animation_player:
        animation_player.play("attack")

func _on_aggro() -> void:
    # Play aggro sound or effect
    EventBus.play_sfx.emit("sfx_enemy_aggro")

func _on_deaggro() -> void:
    _aggroed = false

# === Death ===

func die() -> void:
    EventBus.enemy_killed.emit(get_instance_id(), _player.get_instance_id() if _player else 0, global_position)
    queue_free()
```

---

## Phase 3: Level Design

### Tilemap Setup

```gdscript
# level.gd - Level manager
class_name Level extends Node2D

@export var level_id: String = ""
@export var player_spawn: Marker2D
@export var exit_door: Area2D

@export_group("Level Config")
@export var background_music: String = ""
@export var time_limit: float = 0.0  # 0 = no limit

var _time_remaining: float = 0.0
var _completed: bool = false

func _ready() -> void:
    if time_limit > 0.0:
        _time_remaining = time_limit
    
    # Connect to events
    EventBus.level_started.emit(level_id)
    
    # Start background music
    if background_music:
        EventBus.play_bgm.emit(background_music)
    
    # Connect exit
    if exit_door:
        exit_door.body_entered.connect(_on_player_entered_exit)

func _process(delta: float) -> void:
    if time_limit > 0.0 and not _completed:
        _time_remaining -= delta
        
        if _time_remaining <= 0.0:
            _on_time_up()

func _on_player_entered_exit(body: Node2D) -> void:
    if body.is_in_group("player") and not _completed:
        _complete_level()

func _complete_level() -> void:
    _completed = true
    EventBus.level_completed.emit(level_id)
    
    # Save progress
    SaveManager.save_game()
    
    # Load next level
    var next_level := _get_next_level_path()
    if next_level:
        get_tree().change_scene_to_file(next_level)

func _on_time_up() -> void:
    EventBus.game_over.emit(false)
    get_tree().change_scene_to_file("res://scenes/ui/game_over.tscn")

func _get_next_level_path() -> String:
    # Simple sequential levels
    var level_num := int(level_id.trim_prefix("level_"))
    var next_num := level_num + 1
    return "res://scenes/levels/level_%02d.tscn" % next_num
```

---

## Phase 4: UI & Polish

### HUD Implementation

```gdscript
# hud.gd - Heads-up display
class_name HUD extends CanvasLayer

@export var health_bar: ProgressBar
@export var score_label: Label
@export var currency_label: Label
@export var ability_icons: Array[TextureRect] = []
@export var timer_label: Label

var _current_score: int = 0
var _current_currency: int = 0

func _ready() -> void:
    # Connect to event bus
    EventBus.player_health_changed.connect(_on_player_health_changed)
    EventBus.score_changed.connect(_on_score_changed)
    EventBus.currency_changed.connect(_on_currency_changed)
    EventBus.level_started.connect(_on_level_started)

func _on_player_health_changed(player_id: int, current: float, maximum: float) -> void:
    if health_bar:
        health_bar.max_value = maximum
        health_bar.value = current

func _on_score_changed(new_score: int) -> void:
    _current_score = new_score
    if score_label:
        score_label.text = "Score: %d" % new_score

func _on_currency_changed(new_amount: int) -> void:
    _current_currency = new_amount
    if currency_label:
        currency_label.text = "%d" % new_amount

func _on_level_started(level_id: String) -> void:
    # Reset HUD for new level
    if score_label:
        score_label.text = "Score: 0"
    if currency_label:
        currency_label.text = "0"

func update_timer(seconds: float) -> void:
    if timer_label:
        var mins := int(seconds) / 60
        var secs := int(seconds) % 60
        timer_label.text = "%02d:%02d" % [mins, secs]
```

### Pause Menu

```gdscript
# pause_menu.gd - Pause screen
class_name PauseMenu extends Control

@export var resume_button: Button
@export var restart_button: Button
@export var settings_button: Button
@export var quit_button: Button

var _is_paused: bool = false

func _ready() -> void:
    visible = false
    
    # Connect buttons
    resume_button.pressed.connect(_on_resume_pressed)
    restart_button.pressed.connect(_on_restart_pressed)
    quit_button.pressed.connect(_on_quit_pressed)
    
    # Connect to pause toggle
    EventBus.game_paused.connect(_on_game_paused)
    
    # Handle pause input
    func _input(event: InputEvent) -> void:
        if event.is_action_pressed("pause"):
            _toggle_pause()

func _toggle_pause() -> void:
    _is_paused = not _is_paused
    visible = _is_paused
    get_tree().paused = _is_paused
    EventBus.game_paused.emit(_is_paused)
    
    if _is_paused:
        # Pause music
        AudioManager.bgm_player.stream_paused = true
    else:
        # Resume music
        AudioManager.bgm_player.stream_paused = false

func _on_resume_pressed() -> void:
    _toggle_pause()

func _on_restart_pressed() -> void:
    get_tree().paused = false
    get_tree().reload_current_scene()

func _on_quit_pressed() -> void:
    get_tree().paused = false
    get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")
```

---

## Phase 5: Shaders & VFX

### Custom Shader Examples

```glsl
# shaders/dissolve.gdshader
# Dissolve shader for death/effect transitions

shader_type canvas_item;

uniform sampler2D dissolve_noise;
uniform float dissolve_amount: hint_range(0.0, 1.0) = 0.0;
uniform vec4 dissolve_color: source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float edge_width: hint_range(0.0, 0.1) = 0.02;

void fragment() {
    vec4 tex_color = texture(TEXTURE, UV);
    
    // Sample noise for dissolve pattern
    float noise = texture(dissolve_noise, UV).r;
    
    // Discard pixels beyond dissolve threshold
    float threshold = dissolve_amount;
    if (noise < threshold) {
        discard;
    }
    
    // Draw edge glow
    float edge = noise - threshold;
    if (edge < edge_width) {
        float glow = 1.0 - (edge / edge_width);
        tex_color.rgb = mix(tex_color.rgb, dissolve_color.rgb, glow);
    }
    
    COLOR = tex_color;
}
```

```glsl
# shaders/outline.gdshader
# Outline shader for selection/hover effects

shader_type canvas_item;

uniform vec4 outline_color: source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width: hint_range(1.0, 10.0) = 2.0;

void fragment() {
    vec4 tex_color = texture(TEXTURE, UV);
    
    if (tex_color.a > 0.0) {
        // Inside the sprite, no outline needed
        COLOR = tex_color;
        return;
    }
    
    // Sample neighboring pixels for outline
    vec2 texel_size = 1.0 / vec2(texture_size(TEXTURE));
    
    float alpha = 0.0;
    
    // Sample in a cross pattern
    alpha += texture(TEXTURE, UV + vec2(outline_width * texel_size.x, 0.0)).a;
    alpha += texture(TEXTURE, UV + vec2(-outline_width * texel_size.x, 0.0)).a;
    alpha += texture(TEXTURE, UV + vec2(0.0, outline_width * texel_size.y)).a;
    alpha += texture(TEXTURE, UV + vec2(0.0, -outline_width * texel_size.y)).a;
    
    if (alpha > 0.0) {
        COLOR = outline_color;
    } else {
        COLOR = vec4(0.0);
    }
}
```

### Using Shaders in Code

```gdscript
# Apply dissolve shader to a sprite
func apply_dissolve_effect(sprite: Sprite2D, duration: float) -> void:
    var shader_material := ShaderMaterial.new()
    shader_material.shader = load("res://shaders/dissolve.gdshader")
    
    var noise_texture := load("res://assets/noise.png")
    shader_material.set_shader_parameter("dissolve_noise", noise_texture)
    shader_material.set_shader_parameter("dissolve_color", Color.ORANGE)
    
    sprite.material = shader_material
    
    # Animate dissolve
    var tween := create_tween()
    tween.tween_method(
        func(value): shader_material.set_shader_parameter("dissolve_amount", value),
        0.0, 1.0, duration
    )
    tween.tween_callback(func(): sprite.queue_free())
```

---

## Phase 6: Export Configuration

### Export Presets (project.godot)

```ini
[preset.0]

name="Windows Desktop"
platform="Windows"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/windows/Game.exe"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.0.options]

custom_template/debug=""
custom_template/release=""
debug/export_flags=3
binary_format/embed_pck=true
texture_format/bptc=true
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
binary_format/architecture="x86_64"
dotnet/embed_build_output=true
```

```ini
[preset.1]

name="macOS"
platform="macOS"
runnable=true
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/macos/Game.zip"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.1.options]

custom_template/debug=""
custom_template/release=""
debug/export_flags=0
application/bundle_identifier="com.example.game"
application/name="Game"
application/info="A Godot game"
application/icon=""
application/identifier_prefix="com.example"
application/signing_identity=""
application/code_sign_style=0
application/hardened_runtime=false
application/codesign_config=""
dotnet/embed_build_output=true
```

### Export Script

```python
# scripts/export_game.py
"""Export Godot project to multiple platforms."""

import subprocess
import os
import shutil
from pathlib import Path

GODOT_EXECUTABLE = "/usr/local/bin/godot"  # Adjust path
PROJECT_PATH = "res://"
EXPORT_DIR = Path("build")

PLATFORMS = {
    "windows": "preset.0",
    "macos": "preset.1",
    "linux": "preset.2",
    "web": "preset.3",
}

def export_game(platform: str, export_preset: str) -> bool:
    """Export game for a specific platform."""
    
    output_dir = EXPORT_DIR / platform
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        GODOT_EXECUTABLE,
        "--headless",
        "--export-release",
        f'"{export_preset}"',
        f'"{output_dir}/game"',  # Platform-specific extension added
    ]
    
    print(f"Exporting for {platform}...")
    result = subprocess.run(cmd, cwd=PROJECT_PATH, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Export failed: {result.stderr}")
        return False
    
    print(f"Exported to {output_dir}")
    return True

def main():
    # Clean build directory
    if EXPORT_DIR.exists():
        shutil.rmtree(EXPORT_DIR)
    EXPORT_DIR.mkdir(parents=True)
    
    # Export for all platforms
    for platform, preset in PLATFORMS.items():
        if export_game(platform, preset):
            print(f"✓ {platform}")
        else:
            print(f"✗ {platform}")

if __name__ == "__main__":
    main()
```

---

## Anti-Pattern Watchlist

| Anti-Pattern | Why It Fails | Correct Approach |
|--------------|--------------|------------------|
| `get_node("../../SomeNode")` | Fragile path references break on scene restructure | Use signals and groups |
| `get_tree().get_nodes_in_group()` in `_process()` | O(n) every frame, kills performance | Cache references, use signals |
| Autoload everything | Pollutes global namespace, hidden dependencies | Only autoload: EventBus, AudioManager, SaveManager |
| Scripts without type hints | Loses autocompletion, runtime errors | Always use typed GDScript |
| All logic in `_process()` | 60 FPS logic runs when not needed | Use signals, timers, `_physics_process()` |
| No resource usage | Hardcoded values everywhere | Use `.tres` resources for config |
| Massive single scripts | Hard to maintain, can't reuse | Split into component scenes |
| No save/load system | Progress lost on crash | Implement early, use resources |

---

## Code Quality Checklist

- [ ] All functions have return types: `func foo() -> void:`
- [ ] All parameters typed: `func bar(value: int) -> bool:`
- [ ] Signals declared at top: `signal health_changed(new_value: float)`
- [ ] `@export` for all Inspector-configurable values
- [ ] `@onready` for node references: `@onready var sprite: Sprite2D = $Sprite2D`
- [ ] Scripts < 200 lines (split larger scripts)
- [ ] `class_name` for all reusable classes
- [ ] Groups used for entity discovery: `add_to_group("enemy")`

---

## Execution Checklist

### Phase 1: Project Foundation
- [ ] Directory structure created
- [ ] Autoloads configured (EventBus, AudioManager, SaveManager)
- [ ] Resource definitions created (stats, items, configs)
- [ ] Input Map configured in Project Settings
- [ ] Custom theme for UI (if applicable)

### Phase 2: Core Systems
- [ ] Player scene with component nodes
- [ ] HealthComponent implemented
- [ ] StateMachine with states (idle, run, jump, attack)
- [ ] Enemy scenes with AI states (patrol, chase, attack)
- [ ] Combat system with Area2D/3D hitboxes
- [ ] Signal-based communication (no direct node references)

### Phase 3: Level Design
- [ ] TileSet created and configured
- [ ] Level scenes with spawn points
- [ ] Level transition logic
- [ ] Exit/goal implementation
- [ ] Level manager for game flow

### Phase 4: UI & Polish
- [ ] HUD bound to gameplay signals
- [ ] Health bar updates from HealthComponent
- [ ] Score/currency display
- [ ] Pause menu with resume/restart/quit
- [ ] Game over screen
- [ ] Main menu

### Phase 5: Shaders & VFX
- [ ] Custom ShaderMaterial created
- [ ] Dissolve effect for death
- [ ] Outline effect for selection
- [ ] GPUParticles2D/3D for VFX
- [ ] VFX triggered by events

### Phase 6: Export
- [ ] Export presets for target platforms
- [ ] Windows build tested
- [ ] macOS build tested
- [ ] Web (HTML5) build tested
- [ ] Mobile builds configured (Android, iOS)
