import subprocess
import json

# Test compliant policy
res1 = subprocess.run(
    ["python3", "check_compliance.py"], capture_output=True, text=True
)
assert "COMPLIANT" in res1.stdout, "Failed compliant check"

# Test non-compliant policy (wrong version type)
with open("policy.json", "w") as f:
    json.dump({"version": 1.0, "allowed_ips": ["127.0.0.1"]}, f)
try:
    res2 = subprocess.run(
        ["python3", "check_compliance.py"], capture_output=True, text=True
    )
    assert "NON-COMPLIANT" in res2.stdout, "Failed non-compliant check"
    assert res2.returncode != 0, "Non-compliant should exit with non-zero"
finally:
    # Restore original policy.json
    with open("policy.json", "w") as f:
        json.dump({"version": "1.0.0", "allowed_ips": ["192.168.1.1", "10.0.0.1"]}, f)

print("ALL TESTS PASSED")
