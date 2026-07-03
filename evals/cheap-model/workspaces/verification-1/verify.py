import subprocess
import sys

# Run pytest with coverage check
res = subprocess.run(
    [
        "python3",
        "-m",
        "pytest",
        "--cov=math_utils",
        "test_math_utils.py",
        "--cov-fail-under=100",
    ],
    capture_output=True,
    text=True,
)
print(res.stdout)
print(res.stderr)
sys.exit(res.returncode)
