#!/usr/bin/env python3
import sys
import os
import subprocess

print(
    "WARNING: mem0-v2.test.py has been moved to memory/mem0-v2.test.py. This shim will be removed in the next release.",
    file=sys.stderr,
)
dir_path = os.path.dirname(os.path.realpath(__file__))
new_path = os.path.join(dir_path, "memory/mem0-v2.test.py")
sys.exit(subprocess.call([sys.executable, new_path] + sys.argv[1:]))
