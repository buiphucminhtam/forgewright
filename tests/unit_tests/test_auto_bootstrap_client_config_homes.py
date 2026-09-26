"""Selected native client config homes are explicit, isolated, and safe."""

from pathlib import Path
import json

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture


def test_client_paths_keep_default_homes_without_overrides(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    monkeypatch.delenv("CODEX_HOME", raising=False)
    monkeypatch.delenv("CLAUDE_CONFIG_DIR", raising=False)

    assert bm._client_path("codex") == fixture["home"] / ".codex/config.toml"
    assert bm._client_path("claude-code") == fixture["home"] / ".claude.json"


def test_client_paths_honor_selected_native_override_homes(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    codex_home = fixture["root"] / "selected-codex-home"
    claude_home = fixture["root"] / "selected-claude-home"
    monkeypatch.setenv("CODEX_HOME", str(codex_home))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(claude_home))

    assert bm._client_path("codex") == codex_home / "config.toml"
    assert bm._client_path("claude-code") == claude_home / ".claude.json"


def test_selected_claude_override_is_the_only_mutated_document(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    selected = fixture["root"] / "selected-claude-home"
    selected.mkdir()
    default = fixture["home"] / ".claude.json"
    default.write_text(json.dumps({"user_default": "preserve"}))
    selected_config = selected / ".claude.json"
    selected_config.write_text(json.dumps({"preferences": {"theme": "dark"}}))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(selected))
    monkeypatch.delenv("CODEX_HOME", raising=False)

    bm._configure_client("claude-code")

    assert bm._client_path("claude-code") == selected_config
    assert json.loads(selected_config.read_text())["mcpServers"]["forgewright"]
    assert json.loads(default.read_text()) == {"user_default": "preserve"}
    assert not (fixture["home"] / ".codex/config.toml").exists()


@pytest.mark.parametrize(
    "client, env_name", [("codex", "CODEX_HOME"), ("claude-code", "CLAUDE_CONFIG_DIR")]
)
def test_symlinked_selected_client_home_is_rejected(
    bm, fixture, monkeypatch, client, env_name
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    target = fixture["root"] / "outside-client-home"
    target.mkdir()
    unsafe = fixture["root"] / "unsafe-client-home"
    unsafe.symlink_to(target, target_is_directory=True)
    monkeypatch.setenv(env_name, str(unsafe))

    with pytest.raises(bm.BootstrapError):
        bm._configure_client(client)
    assert list(target.iterdir()) == []


@pytest.mark.parametrize(
    "client, env_name", [("codex", "CODEX_HOME"), ("claude-code", "CLAUDE_CONFIG_DIR")]
)
def test_relative_selected_client_home_is_rejected(
    bm, fixture, monkeypatch, client, env_name
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    monkeypatch.setenv(env_name, "relative-client-home")

    with pytest.raises(bm.BootstrapError):
        bm._configure_client(client)


def test_selected_claude_override_rollback_restores_only_selected_path(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    selected = fixture["root"] / "selected-claude-home"
    selected.mkdir()
    selected_config = selected / ".claude.json"
    before = b'{"preferences":{"theme":"dark"}}\n'
    selected_config.write_bytes(before)
    default = fixture["home"] / ".claude.json"
    default.write_text(json.dumps({"user_default": "preserve"}))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(selected))

    transaction = bm._new_client_transaction()
    bm._configure_client("claude-code", transaction)
    bm._rollback_clients(transaction)

    assert selected_config.read_bytes() == before
    assert json.loads(default.read_text()) == {"user_default": "preserve"}


def test_recovery_after_claude_override_change_cleans_old_path_or_fails_closed(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    selected = fixture["root"] / "selected-claude-home"
    selected.mkdir()
    selected_config = selected / ".claude.json"
    before = b'{"preferences":{"theme":"dark"}}\n'
    selected_config.write_bytes(before)
    default = fixture["home"] / ".claude.json"
    default_before = b'{"user_default":"preserve"}\n'
    default.write_bytes(default_before)
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(selected))

    transaction = bm._new_client_transaction()
    bm._configure_client("claude-code", transaction)
    assert "forgewright" in json.loads(selected_config.read_text())["mcpServers"]
    monkeypatch.delenv("CLAUDE_CONFIG_DIR")

    try:
        bm.recover_global_runtime()
    except bm.BootstrapError:
        assert "forgewright" in json.loads(selected_config.read_text())["mcpServers"]
        assert default.read_bytes() == default_before
        assert bm.load_json(bm._client_progress_path())["status"] != "rolled_back"
    else:
        assert selected_config.read_bytes() == before
        assert default.read_bytes() == default_before


@pytest.mark.parametrize(
    "client, env_name, filename",
    [
        ("codex", "CODEX_HOME", "config.toml"),
        ("claude-code", "CLAUDE_CONFIG_DIR", ".claude.json"),
    ],
)
def test_project_contained_selected_client_home_is_rejected_before_mutation(
    bm, fixture, monkeypatch, client, env_name, filename
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    selected = fixture["project"] / "user-client-home"
    selected.mkdir()
    monkeypatch.setenv(env_name, str(selected))
    journal = {"transaction_id": "active-project-transaction"}

    with (
        bm._track_transaction(fixture["project"], journal),
        pytest.raises(bm.BootstrapError),
    ):
        bm._configure_client(client)

    assert not (selected / filename).exists()
