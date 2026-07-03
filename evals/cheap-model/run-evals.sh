#!/bin/bash
# Forgewright Lite Golden Eval Harness Runner Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Make python script executable
chmod +x "$SCRIPT_DIR/run-evals.py"

# Run python script with forwarded arguments
python3 "$SCRIPT_DIR/run-evals.py" "$@"
