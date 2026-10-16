"""Behavioral boundaries for a local, optionally shared memory database."""

import importlib.util
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "scripts/memory/mem0-v2.py"


def load_core():
    spec = importlib.util.spec_from_file_location("storage_memory", CORE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def stores(tmp_path, monkeypatch):
    module = load_core()
    path = str(tmp_path / "shared/memory.db")
    monkeypatch.setenv("MEM0_PROJECT_ID", "alpha")
    alpha = module.MemoryDB(path)
    a = alpha.add("scope-marker alpha-only decision", category="decisions")["id"]
    monkeypatch.setenv("MEM0_PROJECT_ID", "beta")
    beta = module.MemoryDB(path)
    beta.add("scope-marker beta-only decision")
    return alpha, beta, a


def test_shared_store_filters_all_read_layers(stores):
    alpha, beta, a = stores
    assert a in [r["id"] for r in alpha.search("scope-marker")]
    assert a not in [r["id"] for r in beta.search("scope-marker")]
    assert a not in [r["id"] for r in beta.memory_index("scope-marker")["results"]]
    assert a not in [r["id"] for r in beta.memory_search("scope-marker")["results"]]
    assert beta.memory_get(a) is None
    assert a not in [r["id"] for r in beta.list_all()]


def test_foreign_archive_and_gc_preserve_other_project(stores):
    alpha, beta, a = stores
    assert beta.delete(a) is False
    for n in range(3):
        beta.add(f"beta extra {n}")
    beta.gc(max_obs=1)
    assert alpha.memory_get(a) is not None
    assert beta.count() == 1


def test_graph_and_circuit_ids_are_project_scoped(stores):
    alpha, beta, _ = stores
    for db, title in ((alpha, "alpha"), (beta, "beta")):
        assert db.add_node("root", "semantic", title, title)
        assert db.add_node("child", "episodic", title, title)
        assert db.add_edge("root", "child")
        assert db.save_procedural_circuit("flow", title, '["root"]', 1)
    assert alpha.get_neighbors("root")[0]["title"] == "alpha"
    assert beta.get_neighbors("root")[0]["title"] == "beta"
    assert alpha.get_procedural_circuit("flow")["name"] == "alpha"
    assert alpha.get_neighbors("root")[0]["id"] == "child"


def test_redacts_all_observation_and_graph_fields(tmp_path, monkeypatch):
    monkeypatch.setenv("MEM0_PROJECT_ID", "private")
    db = load_core().MemoryDB(str(tmp_path / "memory.db"))
    secret = "sk-" + "X" * 24
    item = db.add(secret, title=secret, tags=[secret], source=secret)
    assert secret not in str(db.memory_get(item["id"]))
    db.add_node("root", "semantic", secret, secret)
    db.add_node("child", "semantic", secret, secret)
    db.add_edge("root", "child")
    assert secret not in str(db.get_neighbors("root"))
    db.save_procedural_circuit("flow", secret, '["' + secret + '"]', 1)
    assert secret not in str(db.get_procedural_circuit("flow"))


def test_root_and_subdir_resolve_same_db_and_honor_override(tmp_path):
    project = tmp_path / "project"
    (project / "src").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(project)], check=True)
    chosen = tmp_path / "owned/memory.db"
    env = {**os.environ, "MEM0_DB_PATH": str(chosen)}
    add = subprocess.run(
        ["python3", str(CORE), "add", "root-marker"],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    read = subprocess.run(
        ["python3", str(CORE), "search", "root-marker"],
        cwd=project / "src",
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert add.returncode == read.returncode == 0
    assert chosen.exists()
    assert "root-marker" in read.stdout
    assert not (project / "src/.forgewright").exists()
    setup = subprocess.run(
        ["python3", str(CORE), "setup"],
        cwd=project / "src",
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert setup.returncode == 0
    assert not (project / "src/.forgewright").exists()


def test_disabled_library_has_no_side_effect(tmp_path, monkeypatch):
    monkeypatch.setenv("MEM0_DISABLED", "true")
    with pytest.raises(RuntimeError, match="disabled"):
        load_core().MemoryDB(str(tmp_path / "memory.db"))
    assert not (tmp_path / "memory.db").exists()


@pytest.mark.parametrize("kind", ["node", "circuit"])
def test_secret_shaped_identifiers_cannot_bypass_field_redaction(tmp_path, kind):
    db = load_core().MemoryDB(str(tmp_path / "memory.db"))
    secret = "sk-" + "X" * 24
    with pytest.raises(ValueError, match="identifier"):
        if kind == "node":
            db.add_node(secret, "semantic", "safe", "safe")
        else:
            db.save_procedural_circuit(secret, "safe", "[]", 1)


def test_jsonl_import_redacts_content_and_rejects_foreign_scope(tmp_path, monkeypatch):
    import json

    monkeypatch.setenv("MEM0_PROJECT_ID", "owner")
    db = load_core().MemoryDB(str(tmp_path / "memory.db"))
    secret = "sk-" + "X" * 24
    path = tmp_path / "legacy.jsonl"
    path.write_text(
        json.dumps({"memory": secret, "source": secret})
        + "\n"
        + json.dumps({"memory": "foreign-data", "project_root": "another-owner"})
        + "\n"
    )
    db.migrate_from_jsonl(str(path))
    assert secret not in str(db.list_all())
    assert not db.search("foreign-data")


def test_invalid_legacy_timestamp_is_not_imported_as_partial_success(tmp_path):
    import json

    db = load_core().MemoryDB(str(tmp_path / "memory.db"))
    path = tmp_path / "bad.jsonl"
    path.write_text(
        json.dumps({"memory": "invalid-date-marker", "created": "invalid"}) + "\n"
    )
    assert db.migrate_from_jsonl(str(path))["skipped"] == 1
    assert not db.search("invalid-date-marker")
