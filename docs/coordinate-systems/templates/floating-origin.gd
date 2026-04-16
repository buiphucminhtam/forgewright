# floating_origin.gd
# Floating Origin for Godot 4.x
# Handles large world coordinates and prevents floating-point precision issues

class_name FloatingOrigin
extends Node3D

## Signals
signal origin_shifted(old_offset: Vector3, new_offset: Vector3)
signal pre_shift(new_offset: Vector3)
signal post_shift(old_offset: Vector3)

## Configuration
@export var threshold: float = 5000.0
@export var enabled: bool = true
@export var smooth_shift: bool = false
@export var shift_speed: float = 10.0
@export var debug_mode: bool = false

## Internal state
var _world_offset: Vector3 = Vector3.ZERO
var _tracked_nodes: Array[Node3D] = []
var _player: Node3D = null
var _target_offset: Vector3 = Vector3.ZERO
var _is_shifting: bool = false

func _ready() -> void:
	# Track all children of this node by default
	_update_tracked_children()
	
	if debug_mode:
		print("[FloatingOrigin] Initialized with threshold: ", threshold)

func _process(delta: float) -> void:
	if not enabled or _player == null:
		return
	
	# Check if player has exceeded threshold
	var player_pos = _player.global_position
	var distance_from_origin = player_pos.length()
	
	if distance_from_origin > threshold:
		# Calculate new offset to keep player near origin
		_target_offset = -player_pos
		
		if smooth_shift:
			# Smooth interpolation
			_is_shifting = true
			var step = shift_speed * delta * 1000
			var diff = _target_offset - _world_offset
			if diff.length() < step:
				_perform_shift(_target_offset)
				_is_shifting = false
			else:
				_world_offset += diff.normalized() * step
				_apply_offset(_world_offset)
		else:
			# Immediate shift
			_perform_shift(_target_offset)

func _physics_process(_delta: float) -> void:
	# Sync physics after shift
	if _is_shifting:
		_sync_physics()

func _perform_shift(new_offset: Vector3) -> void:
	if new_offset == _world_offset:
		return
	
	var old_offset = _world_offset
	
	# Emit pre-shift signal for chunk loading
	pre_shift.emit(new_offset)
	
	if debug_mode:
		print("[FloatingOrigin] Shifting from ", old_offset, " to ", new_offset)
	
	# Apply the new offset
	_world_offset = new_offset
	_apply_offset(_world_offset)
	
	# Sync physics to prevent collision drift
	_sync_physics()
	
	# Emit post-shift signal for chunk unloading
	post_shift.emit(old_offset)
	
	# Emit main signal
	origin_shifted.emit(old_offset, new_offset)

func _apply_offset(offset: Vector3) -> void:
	# Move all tracked nodes to counteract the offset
	for node in _tracked_nodes:
		if is_instance_valid(node) and node is Node3D:
			# The root node moves, children follow automatically
			# We just need to update our root position
			pass
	
	# Update our own global position
	global_position = offset

func _sync_physics() -> void:
	# Force physics server to sync with new positions
	PhysicsServer3D.sync()

func _update_tracked_children() -> void:
	_tracked_nodes.clear()
	for child in get_children():
		if child is Node3D:
			_tracked_nodes.append(child)

## Public API

### Set the player node that determines when to shift
func set_player(player: Node3D) -> void:
	_player = player
	if debug_mode:
		print("[FloatingOrigin] Player set: ", player.name)

### Track a node manually
func track_node(node: Node3D) -> void:
	if node != null and not _tracked_nodes.has(node):
		_tracked_nodes.append(node)
		if debug_mode:
			print("[FloatingOrigin] Tracking node: ", node.name)

### Untrack a node
func untrack_node(node: Node3D) -> void:
	var index = _tracked_nodes.find(node)
	if index >= 0:
		_tracked_nodes.remove_at(index)
		if debug_mode:
			print("[FloatingOrigin] Untracking node: ", node.name)

### Get current world offset
func get_world_offset() -> Vector3:
	return _world_offset

### Convert world position to local (relative to origin)
func to_local(world_pos: Vector3) -> Vector3:
	return world_pos - _world_offset

### Convert local position to world
func to_world(local_pos: Vector3) -> Vector3:
	return local_pos + _world_offset

### Force an origin shift
func force_shift() -> void:
	if _player != null:
		_target_offset = -_player.global_position
		_perform_shift(_target_offset)

### Reset to origin
func reset() -> void:
	_perform_shift(Vector3.ZERO)

### Get distance from origin
func get_distance_from_origin() -> float:
	if _player != null:
		return _player.global_position.length()
	return global_position.length()

### Check if currently shifting
func is_shifting() -> bool:
	return _is_shifting

### Set threshold at runtime
func set_threshold(new_threshold: float) -> void:
	threshold = new_threshold
	if debug_mode:
		print("[FloatingOrigin] Threshold set to: ", threshold)
