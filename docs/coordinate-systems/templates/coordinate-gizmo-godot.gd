# Coordinate Display Gizmo - Godot 4.x

> An editor tool for Godot 4 that displays real-time coordinate information for selected objects.

## Features

- Display global and local position of selected Node3D
- Show rotation (Euler angles)
- Show scale
- Display distance from world origin
- Precision warning when coordinates are large
- Copy coordinates to clipboard

## Installation

1. Copy `coordinate_gizmo.gd` to your project
2. Enable in Editor Settings or add to autoload

## Usage

```gdscript
# Option 1: Add as Autoload
# project.godot
[autoload]
CoordinateGizmo="res://coordinate_gizmo.gd"

# Option 2: Add to selected scene
var gizmo = preload("res://coordinate_gizmo.gd").new()
add_child(gizmo)
```

## Configuration

```gdscript
# Customize in project settings or code
CoordinateGizmo.enabled = true
CoordinateGizmo.show_local = true
CoordinateGizmo.show_global = true
CoordinateGizmo.precision = 3
CoordinateGizmo.position = Vector2(10, 10)  # Screen position
```

## Code

```gdscript
# coordinate_gizmo.gd
tool
extends Control

@export var enabled: bool = true
@export var show_local: bool = true
@export var show_global: bool = true
@export var show_rotation: bool = true
@export var show_scale: bool = true
@export var precision: int = 3
@export var warning_threshold: float = 5000.0
@export var critical_threshold: float = 10000.0

var panel: Panel
var labels: Array[Label] = []

func _ready() -> void:
    if Engine.is_editor_hint():
        _create_ui()
        visibility_changed.connect(_on_visibility_changed)

func _create_ui() -> void:
    # Panel setup
    panel = Panel.new()
    panel.custom_minimum_size = Vector2(280, 180)
    add_child(panel)
    
    var style = StyleBoxFlat.new()
    style.bg_color = Color(0.1, 0.1, 0.1, 0.9)
    style.border_color = Color(0.3, 0.3, 0.3)
    style.set_corner_radius_all(8)
    panel.add_theme_stylebox_override("panel", style)
    
    # Title
    var title = Label.new()
    title.text = "Coordinates"
    title.position = Vector2(10, 8)
    panel.add_child(title)
    
    # Create labels for each info type
    var info_types = ["Selected", "Global", "Local", "Distance", "Rotation", "Scale"]
    for i in range(info_types.size()):
        var label = Label.new()
        label.name = "Label_" + info_types[i]
        label.text = info_types[i] + ": --"
        label.position = Vector2(10, 30 + i * 22)
        panel.add_child(label)
        labels.append(label)
    
    _update_position()

func _update_position() -> void:
    if panel:
        panel.anchors_preset = Control.PRESET_TOP_LEFT
        panel.margin_left = 10
        panel.margin_top = 10
        panel.margin_right = 290
        panel.margin_bottom = 190

func _process(_delta: float) -> void:
    if not enabled or not Engine.is_editor_hint():
        return
    
    _update_coordinates()

func _update_coordinates() -> void:
    var selection = EditorInterface.get_selection()
    var selected = selection.get_selected_nodes()
    
    if selected.is_empty():
        _set_label(0, "Selected: None")
        return
    
    var node = selected[0] as Node3D
    if not node:
        _set_label(0, "Selected: Not Node3D")
        return
    
    # Selected
    _set_label(0, "Selected: " + node.name)
    
    # Global position
    var global_pos = node.global_position
    var pos_str = "%.3f, %.3f, %.3f" % [global_pos.x, global_pos.y, global_pos.z]
    _set_label(1, "Global: " + pos_str)
    
    # Local position
    if show_local:
        var local_pos = node.position
        var local_str = "%.3f, %.3f, %.3f" % [local_pos.x, local_pos.y, local_pos.z]
        _set_label(2, "Local: " + local_str)
    
    # Distance from origin
    var distance = global_pos.length()
    var dist_str = "%.1f" % distance
    _set_label(3, "Distance: " + dist_str + " units")
    
    # Apply color based on threshold
    var dist_label = labels[3]
    if distance > critical_threshold:
        dist_label.add_theme_color_override("font_color", Color(1, 0.2, 0.2))  # Red
        dist_label.tooltip_text = "CRITICAL: Precision issues likely!"
    elif distance > warning_threshold:
        dist_label.add_theme_color_override("font_color", Color(1, 0.8, 0))  # Yellow
        dist_label.tooltip_text = "WARNING: Monitor precision"
    else:
        dist_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
        dist_label.tooltip_text = "Safe distance"
    
    # Rotation
    if show_rotation:
        var rot = node.rotation_degrees
        var rot_str = "%.1f°, %.1f°, %.1f°" % [rot.x, rot.y, rot.z]
        _set_label(4, "Rotation: " + rot_str)
    
    # Scale
    if show_scale:
        var scale = node.scale
        var scale_str = "%.3f, %.3f, %.3f" % [scale.x, scale.y, scale.z]
        _set_label(5, "Scale: " + scale_str)

func _set_label(index: int, text: String) -> void:
    if index < labels.size():
        labels[index].text = text

func _on_visibility_changed() -> void:
    if panel:
        panel.visible = visible

# Public API
func set_enabled(value: bool) -> void:
    enabled = value
    if panel:
        panel.visible = value

func set_precision(value: int) -> void:
    precision = value
