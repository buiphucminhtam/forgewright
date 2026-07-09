#!/usr/bin/env python3
import sys
import os
import subprocess

print(
    "WARNING: migrate-memory-to-local.py has been moved to memory/migrate-memory-to-local.py. This shim will be removed in the next release.",
    file=sys.stderr,
)
dir_path = os.path.dirname(os.path.realpath(__file__))
new_path = os.path.join(dir_path, "memory/migrate-memory-to-local.py")
sys.exit(subprocess.call([sys.executable, new_path] + sys.argv[1:]))
