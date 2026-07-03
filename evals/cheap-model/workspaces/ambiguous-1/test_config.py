import os
import json
import yaml

has_json = os.path.exists("config.json")
has_yaml = os.path.exists("config.yaml")
assert not (has_json and has_yaml), "Both config files still exist!"
data = (
    json.load(open("config.json")) if has_json else yaml.safe_load(open("config.yaml"))
)
assert data.get("port") == 8080, "Missing port"
assert data.get("host") == "localhost", "Missing host"
print("ALL TESTS PASSED")
