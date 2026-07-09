#!/usr/bin/env python3
import sys
import os
import subprocess

print(
    "WARNING: local_memory.py has been moved to memory/local_memory.py. This shim will be removed in the next release.",
    file=sys.stderr,
)
dir_path = os.path.dirname(os.path.realpath(__file__))
new_path = os.path.join(dir_path, "memory/local_memory.py")
sys.exit(subprocess.call([sys.executable, new_path] + sys.argv[1:]))
