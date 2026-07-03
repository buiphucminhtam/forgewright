# character-controller-godot.gd
# Preset template for a professional 3D Character Controller in Godot 4.x.
# Handles slope handling, coyote time, jump buffering, and responsive acceleration.

extends CharacterBody3D

@export_category("Movement")
@export var speed := 7.0
@export var acceleration := 15.0
@export var deceleration := 10.0

@export_category("Physics / Gravity")
@export var gravity_scale := 1.0
@export var jump_velocity := 8.0
@export var terminal_velocity := 60.0

@export_category("Slopes")
@export var max_slope_angle_degrees := 45.0

# Input Buffering & Coyote Time variables
var jump_buffer_time := 0.15 # seconds
var coyote_time := 0.15 # seconds
var time_since_grounded := 0.0
var time_since_jump_request := 99.0

# Get the gravity from the project settings to be synced with RigidBody nodes.
@onready var default_gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready() -> void:
	# Configure floor settings
	floor_max_angle = deg_to_rad(max_slope_angle_degrees)
	floor_constant_speed = true
	floor_snap_length = 0.5

func _physics_process(delta: float) -> void:
	# Calculate times
	if is_on_floor():
		time_since_grounded = 0.0
	else:
		time_since_grounded += delta
		
	time_since_jump_request += delta

	# 1. Apply Gravity (Framerate-independent)
	if not is_on_floor():
		velocity.y -= default_gravity * gravity_scale * delta
		velocity.y = max(velocity.y, -terminal_velocity)

	# 2. Handle Jump Input Buffer & Coyote Time
	if Input.is_action_just_pressed("jump"):
		time_since_jump_request = 0.0

	# Jump condition
	if time_since_jump_request <= jump_buffer_time and time_since_grounded <= coyote_time:
		velocity.y = jump_velocity
		time_since_jump_request = 99.0 # Consume jump
		time_since_grounded = 99.0

	# 3. Get Input & Direction
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	
	# Translate input relative to camera/global transform
	var basis := global_transform.basis
	var direction := (basis.x * input_dir.x + basis.z * input_dir.y).normalized()

	# 4. Apply Horizontal Movement (Lerp velocity for smooth accel/decel)
	var target_vel_x := direction.x * speed
	var target_vel_z := direction.z * speed

	if direction.length() > 0.0:
		velocity.x = move_toward(velocity.x, target_vel_x, acceleration * delta)
		velocity.z = move_toward(velocity.z, target_vel_z, acceleration * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, deceleration * delta)
		velocity.z = move_toward(velocity.z, 0.0, deceleration * delta)

	# 5. Move using built-in slide collision solver
	move_and_slide()
