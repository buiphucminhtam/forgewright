#!/bin/bash
# Auto-injects skill counts and versions into README and package.json
VERSION=$(grep -m1 '"version"' package.json | awk -F'"' '{print $4}')
SKILLS=$(ls skills | wc -l | tr -d ' ')

echo "Injecting Version: $VERSION and Skills: $SKILLS"
# TODO: Implement sed replacements
