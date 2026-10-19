"""Finite rollout preflight: retire owned preparation permissions, verify tests and Docs."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / ".forgewright/verify/resource-rollout-completion"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main():
    if len(sys.argv) != 1:
        raise SystemExit("this preflight accepts no arguments")
    controller = load("rollout_preflight_controller", TASK / "validation-controller.py")
    deployed, _, _ = controller.modules()
    sys.path.insert(0, str(controller.DEPLOYED / "scripts/runtime"))
    from project_recipe import require_managed

    require_managed(ROOT)
    home = Path.home().resolve() / ".forgewright/runtime/admission"
    retired = controller.retire_preparation_profiles(home, deployed)
    tests = [".forgewright/recipes/test_rollout_final_review.py"]
    output = Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"])
    descriptor = os.open(
        output / "preflight-pytest.log",
        os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
    )
    with os.fdopen(descriptor, "w+b") as stream:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", *tests],
            cwd=ROOT,
            timeout=180,
            stdout=stream,
            stderr=subprocess.STDOUT,
            check=False,
        )
        stream.flush()
        stream.seek(0)
        raw = stream.read(131073)
    controller.demand(len(raw) <= 131072, "preflight test output exceeded fixed bound")
    print(raw.decode("utf-8"), end="")
    controller.demand(
        type(result.returncode) is int and result.returncode == 0,
        "preflight tests failed",
    )
    docs = load(
        "rollout_preflight_docs", ROOT / ".forgewright/recipes/rollout-docs-final-v2.py"
    )
    docs_exit = docs.main()
    controller.demand(
        type(docs_exit) is int and docs_exit == 0, "preflight strict Docs failed"
    )
    inspector = load(
        "rollout_preflight_inspector",
        ROOT / ".forgewright/recipes/rollout-inspection.py",
    )
    controller.demand(inspector.main() == 0, "fixed inspection failed")
    print(
        json.dumps(
            {
                "schema": "forgewright-rollout-preflight/v1",
                "retired_setup_profiles": retired,
                "tests_exit_code": result.returncode,
                "docs_exit_code": docs_exit,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
