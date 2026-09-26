"""Live asset readiness is independent of deletion ownership (mocked units)."""

from __future__ import annotations

import json

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture
index_fixture = baseline.index_fixture


@pytest.mark.parametrize(
    "relative",
    [
        ".forgewright/project.json",
        ".forgewright/project-profile.json",
        ".forgewright/execution-policy.yaml",
        ".forgewright/docs-manifest.json",
        "docs/project-state.json",
    ],
)
def test_preserved_required_file_disappearance_is_not_ready(bm, fixture, relative):
    project = fixture["project"]
    target = project / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        (
            "mode: strict\n"
            "require_verify: true\n"
            "max_escalations: 3\n"
            "refresh_interval_ticks: 10\n"
            "deny_patterns:\n"
            '  - "rm"\n'
        )
        if relative.endswith(".yaml")
        else '{"schema_version":1}'
    )
    bm.ensure(str(project), "automation")
    assert relative not in {r["path"] for r in bm.read_state(project)["owned_paths"]}
    target.unlink()
    result = bm.verify(str(project))
    assert result["ok"] is False
    assert any(relative in issue for issue in result["issues"])


def test_live_docs_registration_required_even_when_preserved(bm, fixture):
    project = fixture["project"]
    bm.atomic_json(
        bm._docs_registry_path(),
        {"schema_version": 1, "projects": [{"id": "existing", "root": str(project)}]},
    )
    bm.ensure(str(project), "automation")
    bm.atomic_json(bm._docs_registry_path(), {"schema_version": 1, "projects": []})
    assert bm.verify(str(project))["ok"] is False


@pytest.mark.parametrize(
    "damage", ["empty", "bad_json", "foreign", "missing_db", "empty_db", "stats"]
)
def test_gitnexus_requires_usable_metadata_and_database(
    bm, fixture, monkeypatch, damage
):
    project = fixture["project"]
    index_fixture(project)
    meta = project / ".gitnexus/gitnexus.json"
    if damage == "empty":
        meta.unlink()
    elif damage == "bad_json":
        meta.write_text("{")
    elif damage in {"foreign", "stats"}:
        data = json.loads(meta.read_text())
        data["repoPath" if damage == "foreign" else "stats"] = (
            "/other" if damage == "foreign" else {}
        )
        meta.write_text(json.dumps(data))
    elif damage == "missing_db":
        (project / ".gitnexus/lbug").unlink()
    else:
        (project / ".gitnexus/lbug").write_bytes(b"")
    # Exercise the production adapter's preserved-index branch, without a CLI run.
    from tests.unit_tests.test_auto_bootstrap import module

    adapter = module().gitnexus
    assert adapter(project)["status"] != "ready"


def test_preserved_index_disappearance_breaks_verify(bm, fixture):
    project = fixture["project"]
    index_fixture(project)
    bm.ensure(str(project), "automation")
    (project / ".gitnexus/lbug").unlink()
    assert bm.verify(str(project))["ok"] is False


def test_legacy_metadata_supported_but_corrupt_primary_never_falls_back(bm, fixture):
    project = fixture["project"]
    index_fixture(project)
    meta = project / ".gitnexus/gitnexus.json"
    meta.rename(meta.with_name("meta.json"))
    from tests.unit_tests.test_auto_bootstrap import module

    adapter = module().gitnexus
    assert adapter(project)["status"] == "ready"
    meta.write_text("{")
    assert adapter(project)["status"] != "ready"
