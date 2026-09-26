"""A missing Docs entry is already removed, not permission to retry a failing CLI."""

import pytest
from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture


def test_disable_accepts_already_removed_owned_registry_entry(bm, fixture, monkeypatch):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    registry = bm._docs_registry()
    registry["projects"] = [
        entry for entry in registry["projects"] if entry["root"] != str(project)
    ]
    bm.atomic_json(bm._docs_registry_path(), registry)
    original = bm.call_forge

    def missing_is_error(args, **kwargs):
        if args[:3] == ["docs", "registry", "remove"]:
            raise bm.BootstrapError("adapter_failed", "Project is not registered")
        return original(args, **kwargs)

    monkeypatch.setattr(bm, "call_forge", missing_is_error)
    result = bm.disable(str(project), keep_profile=False)
    assert result["status"] == "disabled"
    assert not bm.state_path(project).exists()


def test_disable_retry_after_removal_effect_does_not_call_missing_entry_again(
    bm, fixture, monkeypatch
):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    original = bm.call_forge
    calls = []

    def remove_then_fail(args, **kwargs):
        if args[:3] == ["docs", "registry", "remove"]:
            calls.append(args)
            if bm._docs_entry_digest(project) is None:
                raise bm.BootstrapError("adapter_failed", "Project is not registered")
            original(args, **kwargs)
            raise bm.BootstrapError(
                "adapter_failed", "interruption after successful removal"
            )
        return original(args, **kwargs)

    monkeypatch.setattr(bm, "call_forge", remove_then_fail)
    with pytest.raises(bm.BootstrapError):
        bm.disable(str(project), keep_profile=False)
    assert bm._docs_entry_digest(project) is None
    result = bm.disable(str(project), keep_profile=False)
    assert result["status"] == "disabled"
    assert len(calls) == 1
    assert not bm.state_path(project).exists()
