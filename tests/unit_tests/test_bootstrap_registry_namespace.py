"""Bootstrap registration must not overwrite the legacy global MCP registry."""

import json
from pathlib import Path
import subprocess

import pytest

from tests.unit_tests import test_auto_bootstrap as bootstrap_fixtures

bm = bootstrap_fixtures.bm
fixture = bootstrap_fixtures.fixture


@pytest.mark.parametrize("populated", [False, True])
@pytest.mark.parametrize("rollback_first", [False, True])
def test_legacy_mcp_registry_survives_bootstrap_lifecycle(
    bm, fixture, monkeypatch, populated, rollback_first
):
    legacy = fixture["home"] / "registry.json"
    projects = (
        {"/other/project": {"forgewright_path": "/other/runtime"}} if populated else {}
    )
    legacy.write_text(
        json.dumps({"version": "1.0", "projects": projects}, indent=2) + "\n"
    )
    before = legacy.read_bytes()
    identity = legacy.stat()
    project = fixture["project"]
    if rollback_first:
        monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
        with pytest.raises(bm.BootstrapError) as error:
            bm.ensure(str(project), "automation")
        assert error.value.code == "injected_failure"
        assert bm._read_journal(project)["status"] == "rolled_back"
        assert bm.read_state(project)["status"] == "blocked"
        monkeypatch.delenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE")
    result = bm.ensure(str(project), "automation", repair=rollback_first)
    assert result["status"] == "ready"
    assert bm.verify(str(project))["ok"] is True
    canonical = fixture["home"] / "bootstrap-registry.json"
    registry = json.loads(canonical.read_text())
    assert registry["schema"] == bm.REGISTRY_SCHEMA
    assert registry["projects"][0]["root"] == str(project)
    assert bm.disable(str(project), keep_profile=False)["status"] == "disabled"
    assert json.loads(canonical.read_text())["projects"] == []
    after = legacy.stat()
    assert legacy.read_bytes() == before
    assert (after.st_ino, after.st_mode, after.st_mtime_ns) == (
        identity.st_ino,
        identity.st_mode,
        identity.st_mtime_ns,
    )


def test_existing_bootstrap_registry_retains_entries_without_rewriting_legacy(
    bm, fixture
):
    legacy = fixture["home"] / "registry.json"
    other = {
        "root": "/other/project",
        "root_digest": "b" * 64,
        "mode": "automation",
        "status": "ready",
        "updated_at": "2026-09-01T00:00:00Z",
    }
    value = {
        "schema": bm.REGISTRY_SCHEMA,
        "projects": [other],
        "extension": "preserved",
    }
    legacy.write_text(json.dumps(value) + "\n")
    before = legacy.read_bytes()
    assert bm.registry() == value
    assert not (fixture["home"] / "bootstrap-registry.json").exists()
    bm.register_project(fixture["project"], "automation", "ready")
    canonical = fixture["home"] / "bootstrap-registry.json"
    copied = json.loads(canonical.read_text())
    assert other in copied["projects"]
    assert len(copied["projects"]) == 2
    assert copied["extension"] == "preserved"
    bm.unregister_project(fixture["project"])
    assert bm.registry() == value
    assert legacy.read_bytes() == before


def test_canonical_bootstrap_registry_takes_precedence_without_merging_stale_legacy(
    bm, fixture
):
    canonical = {"schema": bm.REGISTRY_SCHEMA, "projects": []}
    (fixture["home"] / "bootstrap-registry.json").write_text(json.dumps(canonical))
    legacy = fixture["home"] / "registry.json"
    legacy.write_text(
        json.dumps({"schema": bm.REGISTRY_SCHEMA, "projects": [{"root": "/stale"}]})
    )
    before = legacy.read_bytes()
    assert bm.registry() == canonical
    assert legacy.read_bytes() == before


@pytest.mark.parametrize(
    "name,payload",
    [
        ("bootstrap-registry.json", {"schema": "unknown", "projects": []}),
        (
            "bootstrap-registry.json",
            {"schema": "forgewright-bootstrap-registry/v1", "projects": {}},
        ),
        ("bootstrap-registry.json", {"version": "1.0", "projects": {}}),
        ("registry.json", {"schema": "unknown", "projects": []}),
        (
            "registry.json",
            {"schema": "forgewright-bootstrap-registry/v1", "projects": {}},
        ),
        ("registry.json", {"version": "unknown", "projects": {}}),
        ("registry.json", {"schema": "unknown", "version": "1.0", "projects": {}}),
    ],
)
def test_invalid_registry_namespace_fails_closed(bm, fixture, name, payload):
    path = fixture["home"] / name
    path.write_text(json.dumps(payload))
    before = path.read_bytes()
    with pytest.raises(bm.BootstrapError):
        bm.register_project(fixture["project"], "automation", "ready")
    assert path.read_bytes() == before


def test_cli_bootstrap_registry_namespace_uses_the_canonical_path():
    from tests.ci_tools import node_module_file

    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [
            "node",
            node_module_file(root, "cli", "vitest/vitest.mjs"),
            "run",
            "tests/bootstrap.test.ts",
            "-t",
            "namespaces bootstrap registration",
        ],
        cwd=root / "src/cli",
        capture_output=True,
        text=True,
        timeout=45,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize(
    "contents", ["null\n", "{invalid", '{"schema":"wrong","projects":[]}']
)
def test_malformed_canonical_never_falls_back_to_valid_legacy(bm, fixture, contents):
    canonical = fixture["home"] / "bootstrap-registry.json"
    canonical.write_text(contents)
    legacy = fixture["home"] / "registry.json"
    legacy.write_text(json.dumps({"schema": bm.REGISTRY_SCHEMA, "projects": []}))
    before = legacy.read_bytes()
    with pytest.raises(bm.BootstrapError):
        bm.register_project(fixture["project"], "automation", "ready")
    assert canonical.read_text() == contents
    assert legacy.read_bytes() == before
