#!/usr/bin/env python3
"""
Forgewright Kitbash Assembler
Mã nguồn Python hỗ trợ AI Level Designer xây dựng Map/Scene tự động thông qua file định dạng JSON.
Thiết kế chạy trên Unity Editor (C# Reflection/UnityPy) hoặc Unreal Engine Python API.
"""

import os
import sys
import json
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def process_kitbash_map(json_path):
    if not os.path.exists(json_path):
        logging.error(f"Cannot find map layout file: {json_path}")
        sys.exit(1)

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        logging.error(f"Invalid JSON map format: {e}")
        sys.exit(1)

    # Validate structure
    layout_name = data.get("layout_name", "Untitled Level")
    assets = data.get("assets", [])
    
    if not assets:
        logging.warning("Map file contains no assets. Canceling spawn.")
        sys.exit(0)

    logging.info(f"Initializing Vibe Coding Kitbash Assembly: '{layout_name}'...")
    logging.info(f"Detected {len(assets)} modular pieces.")
    
    # Engine Detection Logic (Mock implementation)
    # Ideally, this would use unreal API (unreal.EditorLevelLibrary) 
    # or output a C# Editor Script for Unity.
    
    is_unreal = "UnrealEditor" in os.environ.get("IDE_PROCESS", "")
    
    if is_unreal:
        logging.info("Executing Unreal Engine PCG Asset Insertion...")
        # import unreal
        # Execute spawning log
        for idx, item in enumerate(assets):
            asset_path = item.get("asset_path", "")
            location = item.get("location", {"x": 0, "y": 0, "z": 0})
            rotation = item.get("rotation", {"pitch": 0, "yaw": 0, "roll": 0})
            
            logging.info(f"[{idx+1}/{len(assets)}] Spawning '{asset_path}' at (X:{location['x']}, Y:{location['y']}, Z:{location['z']})...")
            # unreal.EditorLevelLibrary.spawn_actor_from_class(...)
            
        logging.info("Unreal Map Generation Complete.")
        
    else:
        # Fallback to Unity / Generic C# Builder Exporter
        logging.info("Targetting Unity / Open Asset Workflow.")
        cs_script_path = os.path.join(os.path.dirname(json_path), "FWAICheck_Kitbash.cs")
        
        logging.info("Generating Unity C# Editor Builder Script...")
        
        cs_code = """using UnityEngine;
using UnityEditor;

public class FWKitbashBuilder : MonoBehaviour {
    [MenuItem("Forgewright/Assemble AI Kitbash")]
    public static void Assemble() {
        Debug.Log("Spawning Kitbash...");
"""
        for item in assets:
            mod_id = item.get("asset_path", "DefaultCube")
            loc = item.get("location", {"x": 0, "y": 0, "z": 0})
            cs_code += f"        // Instantiate {mod_id} at {loc['x']}, {loc['y']}, {loc['z']}\n"
            
        cs_code += """        Debug.Log("Finished assembling.");
    }
}
"""
        with open(cs_script_path, 'w', encoding='utf-8') as cs_out:
            cs_out.write(cs_code)
            
        logging.info(f"Unity C# Assembler generated at: {cs_script_path}")
        logging.info("Switch to Unity Editor and click 'Forgewright -> Assemble AI Kitbash'.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: kitbash-assembler.py <path_to_map.json>")
        sys.exit(1)
        
    process_kitbash_map(sys.argv[1])
