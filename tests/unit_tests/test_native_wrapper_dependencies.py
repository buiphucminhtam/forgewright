"""Native wrappers preserve their oracle under supported npm dependency layouts."""

import importlib.util
import json
from pathlib import Path
import shutil

import pytest


ROOT = Path(__file__).resolve().parents[2]
CASES = {
    "mcp": (
        "test_mcp_lifecycle_startup.py",
        "test_native_mcp_startup_contention_and_ownership_contract",
        "mcp",
        ["run", "src/runtime/lifecycle-lease.test.ts", "--reporter=basic"],
    ),
    "cli": (
        "test_bootstrap_registry_namespace.py",
        "test_cli_bootstrap_registry_namespace_uses_the_canonical_path",
        "src/cli",
        ["run", "tests/bootstrap.test.ts", "-t", "namespaces bootstrap registration"],
    ),
}


@pytest.mark.parametrize("component", ["mcp", "cli"])
@pytest.mark.parametrize("layout", ["configured", "component", "hoisted", "missing"])
def test_native_wrapper_uses_supported_dependency_layout(
    tmp_path, monkeypatch, component, layout
):
    filename, test_name, component_path, expected_args = CASES[component]
    spec = importlib.util.spec_from_file_location(
        "wrapper_dependency_case", ROOT / "tests/unit_tests" / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    workspace = tmp_path / "workspace"
    (workspace / component_path).mkdir(parents=True)
    canonical = workspace / "scripts/ci/local-ci.py"
    canonical.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / "scripts/ci/local-ci.py", canonical)
    monkeypatch.setattr(
        module, "__file__", str(workspace / "tests/unit_tests" / filename)
    )
    if hasattr(module, "ROOT"):
        monkeypatch.setattr(module, "ROOT", workspace)
    for name in (
        "FORGEWRIGHT_ROOT_NODE_MODULES",
        "FORGEWRIGHT_MCP_NODE_MODULES",
        "FORGEWRIGHT_CLI_NODE_MODULES",
    ):
        monkeypatch.delenv(name, raising=False)

    marker = tmp_path / "invocation.json"
    locations = {
        "configured": tmp_path / "configured-node-modules",
        "component": workspace / component_path / "node_modules",
        "hoisted": workspace / "node_modules",
    }
    selected = {
        "configured": ["configured", "component", "hoisted"],
        "component": ["component", "hoisted"],
        "hoisted": ["hoisted"],
        "missing": [],
    }[layout]
    for name in selected:
        entry = locations[name] / "vitest/vitest.mjs"
        entry.parent.mkdir(parents=True)
        entry.write_text(
            "import {writeFileSync} from 'node:fs';\n"
            f"writeFileSync({json.dumps(str(marker))}, JSON.stringify({{"
            f"selected:{json.dumps(name)}, args:process.argv.slice(2), cwd:process.cwd()"
            "}));\n"
        )
    if layout == "configured":
        monkeypatch.setenv(
            f"FORGEWRIGHT_{component.upper()}_NODE_MODULES", str(locations[layout])
        )

    wrapper = getattr(module, test_name)
    if layout == "missing":
        with pytest.raises(AssertionError, match="npm run ci:bootstrap"):
            wrapper()
        assert not marker.exists()
        return
    wrapper()
    invocation = json.loads(marker.read_text())
    assert invocation == {
        "selected": layout,
        "args": expected_args,
        "cwd": str(workspace / component_path),
    }
