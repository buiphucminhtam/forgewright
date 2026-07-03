import subprocess

res1 = subprocess.run(
    ["python3", "greet.py", "--name", "Alice", "--format", "json"],
    capture_output=True,
    text=True,
)
assert '"greeting": "Hello, Alice"' in res1.stdout, "Failed JSON format check"
res2 = subprocess.run(
    ["python3", "greet.py", "--name", "Bob", "--format", "text"],
    capture_output=True,
    text=True,
)
assert "Hello, Bob" in res2.stdout, "Failed text format check"
print("ALL TESTS PASSED")
