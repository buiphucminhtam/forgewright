import os


def read_file(filepath):
    # Vulnerable implementation
    full_path = os.path.join("safe_dir", filepath)
    with open(full_path, "r") as f:
        return f.read()
