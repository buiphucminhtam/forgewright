# save-system-godot.gd
# Preset template for a professional encrypted Save/Load system in Godot 4.x.
# Uses AES encryption for local save data to prevent basic client-side cheating in mid-core games.

extends Node

const SAVE_PATH = "user://save_game.dat"
# In a real game, keep this key obfuscated or retrieve it dynamically
const ENCRYPTION_KEY = "F0rg3wr1ght_K3y_S3cr3t!"

# Default Player Data Schema
var default_data := {
	"version": "1.0.0",
	"timestamp": 0.0,
	"player": {
		"level": 1,
		"xp": 0,
		"gold": 100,
		"gems": 10,
		"unlocked_talents": [],
		"inventory": [
			{"id": "sword_01", "level": 1, "equipped": true}
		]
	},
	"settings": {
		"sfx_volume": 0.8,
		"bgm_volume": 0.8,
		"haptics_enabled": true
	}
}

# The active player data loaded in memory
var active_data: Dictionary = {}

func _ready() -> void:
	# Load or initialize data on startup
	active_data = load_game()

## Saves the player state to disk with AES-256 encryption
func save_game(custom_data: Dictionary = active_data) -> bool:
	custom_data["timestamp"] = Time.get_unix_time_from_system()
	
	var json_string = JSON.stringify(custom_data)
	var file = FileAccess.open_encrypted_with_pass(SAVE_PATH, FileAccess.WRITE, ENCRYPTION_KEY)
	
	if file == null:
		push_error("SaveGame Error: Unable to open save file path. Code: %d" % FileAccess.get_open_error())
		return false
		
	file.store_string(json_string)
	file.close()
	return true

## Loads and decrypts player state. Falls back to default data if save doesn't exist
func load_game() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		push_warning("SaveGame Warning: No save file found. Initializing default data.")
		var initial_data = default_data.duplicate(true)
		save_game(initial_data)
		return initial_data

	var file = FileAccess.open_encrypted_with_pass(SAVE_PATH, FileAccess.READ, ENCRYPTION_KEY)
	
	if file == null:
		push_error("SaveGame Error: Unable to open and decrypt save file. Code: %d" % FileAccess.get_open_error())
		return default_data.duplicate(true) # Safe fallback
		
	var content = file.get_as_text()
	file.close()
	
	var json = JSON.new()
	var error = json.parse(content)
	
	if error == OK:
		var data = json.get_data()
		if typeof(data) == TYPE_DICTIONARY:
			return data
		else:
			push_error("SaveGame Error: Saved data is not a Dictionary. Corrupted save?")
	else:
		push_error("SaveGame Error: JSON parse failed. Message: %s" % json.get_error_message())
		
	return default_data.duplicate(true)

## Resets save data back to default values
func reset_save() -> void:
	active_data = default_data.duplicate(true)
	save_game(active_data)
	push_info("SaveGame: Reset player save data to defaults.")

func push_info(message: String) -> void:
	print("[SaveSystem] %s" % message)
