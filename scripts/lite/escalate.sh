#!/usr/bin/env bash
# scripts/lite/escalate.sh
# Builds context packets (task, evidence, diff, slices) and delegates to configured expert CLI.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export PROJECT_ROOT

python3 - "$@" << 'EOF'
import sys
import os
import subprocess
import json
import re
import tempfile
import time

def get_expert_cli():
    cli = "agy"
    config_path = os.path.join(os.environ.get("PROJECT_ROOT", "."), ".production-grade.yaml")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                content = f.read()
                match = re.search(r'expert_cli:\s*([^\s]+)', content)
                if match:
                    cli = match.group(1)
        except Exception:
            pass
    return cli

def get_git_diff():
    try:
        diff = subprocess.check_output(["git", "diff", "HEAD"], text=True, stderr=subprocess.DEVNULL)
        return diff[:10000]
    except Exception:
        return ""

def get_evidence():
    # In a real scenario, this might read from a test runner output or verification log.
    return "Escalation requested based on objective runtime signals or budget limits."

def main():
    args = sys.argv[1:]
    is_dry_run = "--dry-run" in args
    if is_dry_run:
        args.remove("--dry-run")
        
    task_desc = " ".join(args) if args else ""
    if not task_desc and not sys.stdin.isatty():
        task_desc = sys.stdin.read().strip()

    if not task_desc:
        task_desc = "No task provided."

    expert_cli = get_expert_cli()
    
    # Build context packet
    packet = {
        "task": task_desc,
        "evidence": get_evidence(),
        "diff": get_git_diff(),
        "relevant_slices": []
    }
    
    packet_json = json.dumps(packet, indent=2)
    
    if is_dry_run:
        print("[DRY RUN] Context Packet Built:")
        print(packet_json)
        print(f"[DRY RUN] Would execute CLI: {expert_cli} (noninteractive)")
        print("[DRY RUN] Would log cost and result.")
        sys.exit(0)
        
    # Write to temp file to avoid exposing secrets in argv
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(packet_json)
        packet_file = f.name
        
    print(f"[ESCALATE] Built context packet: {packet_file}")
    print(f"[ESCALATE] Launching expert CLI: {expert_cli}...")
    
    start_time = time.time()
    
    # Support noninteractive CLI (e.g. agy --headless)
    cmd = [expert_cli, "--headless", "--prompt-file", packet_file]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        latency = int((time.time() - start_time) * 1000)
        
        print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
            
        print(f"[ESCALATE] Completed in {latency}ms. Logging cost and result.")
        # Minimal logging
        with open("escalation_cost.log", "a") as log:
            log.write(f"[{time.time()}] CLI: {expert_cli}, Exit: {result.returncode}, Latency: {latency}ms\n")
            
        os.remove(packet_file)
        sys.exit(result.returncode)
    except FileNotFoundError:
        print(f"[ESCALATE] Error: Expert CLI '{expert_cli}' not found in PATH.", file=sys.stderr)
        os.remove(packet_file)
        sys.exit(1)

if __name__ == "__main__":
    main()
EOF
