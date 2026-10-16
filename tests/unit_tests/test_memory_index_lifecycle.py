"""Read-only search, recoverable migrations and transactional FTS behavior."""

import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "scripts/memory/mem0-v2.py"


def core():
    spec = importlib.util.spec_from_file_location("index_memory", CORE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_reopen_and_search_do_not_rebuild_schema_or_modify_records(
    tmp_path, monkeypatch
):
    module = core()
    path = str(tmp_path / "memory.db")
    db = module.MemoryDB(path)
    db.add("Phaser game engine")
    real_connect = sqlite3.connect
    statements = []

    def observed(*args, **kwargs):
        connection = real_connect(*args, **kwargs)
        connection.set_trace_callback(statements.append)
        return connection

    monkeypatch.setattr(module.sqlite3, "connect", observed)
    reopened = module.MemoryDB(path)
    assert reopened.search("Phaser")
    assert reopened.memory_search("Phaser")["results"]
    forbidden = ("CREATE", "INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "REPLACE")
    assert not [s for s in statements if s.lstrip().upper().startswith(forbidden)]


def test_vietnamese_diacritics_and_punctuation_find_expected_decision(tmp_path):
    db = core().MemoryDB(str(tmp_path / "memory.db"))
    wanted = db.add("Điểm neo nhân vật và màn hình kết quả", category="decisions")["id"]
    for query in ("diem neo", "nhan vat", "man hinh ket qua", '"điểm" -neo: (nhân)'):
        assert wanted in [r["id"] for r in db.search(query)]
    assert db.memory_search("!!!")["results"] == []


def test_rolled_back_insert_is_not_visible_in_content_or_fts(tmp_path):
    db = core().MemoryDB(str(tmp_path / "memory.db"))
    conn = db.get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        inserted = db.add("rollback-marker", _connection=conn)
        conn.rollback()
    finally:
        conn.close()
    assert db.memory_get(inserted["id"]) is None
    assert not db.memory_search("rollback-marker")["results"]


def test_versioned_migration_preserves_ids_requires_backup_and_adopts_explicit_scope(
    tmp_path, monkeypatch
):
    module = core()
    monkeypatch.setenv("MEM0_PROJECT_ID", "new-scope")
    path = tmp_path / "memory.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(module.SCHEMA)
        conn.execute(
            "INSERT INTO observations(id,project_root,type,title,content,content_hash) VALUES(42,'legacy','decisions','legacy title','legacy engine decision','legacy-hash')"
        )
        conn.execute("PRAGMA user_version=0")
    before = path.read_bytes()
    with pytest.raises(RuntimeError, match="migration"):
        module.MemoryDB(str(path))
    assert path.read_bytes() == before
    backup = tmp_path / "owned-backup.db"
    result = subprocess.run(
        [
            "python3",
            str(CORE),
            "migrate-db",
            "--backup",
            str(backup),
            "--from-project",
            "legacy",
        ],
        cwd=tmp_path,
        env={
            **os.environ,
            "MEM0_DB_PATH": str(path),
            "FORGEWRIGHT_WORKSPACE": str(tmp_path),
        },
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr + result.stdout
    assert backup.is_file()
    reopened = module.MemoryDB(str(path))
    assert reopened.memory_get(42)["content"] == "legacy engine decision"
    assert reopened.memory_search("legacy")["results"][0]["id"] == 42
    with sqlite3.connect(backup) as conn:
        assert (
            conn.execute(
                "SELECT project_root FROM observations WHERE id=42"
            ).fetchone()[0]
            == "legacy"
        )


def test_backup_and_retention_preview_preserve_data(tmp_path):
    db = core().MemoryDB(str(tmp_path / "memory.db"))
    item = db.add("persist-before-backup")
    env = {
        **os.environ,
        "MEM0_DB_PATH": db.db_path,
        "FORGEWRIGHT_WORKSPACE": str(tmp_path),
    }
    preview = subprocess.run(
        ["python3", str(CORE), "retention-preview", "--max-obs", "0"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert preview.returncode == 0, preview.stderr
    assert json.loads(preview.stdout)["mutated"] is False
    assert db.memory_get(item["id"]) is not None
    backup = tmp_path / "backup.db"
    result = subprocess.run(
        ["python3", str(CORE), "backup", "--destination", str(backup)],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(backup) as conn:
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert (
            conn.execute(
                "SELECT content FROM observations WHERE id=?", (item["id"],)
            ).fetchone()[0]
            == "persist-before-backup"
        )


def test_memory_database_symlink_is_rejected_before_outside_write(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    link = tmp_path / "linked"
    link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="unsafe"):
        core().MemoryDB(str(link / "memory.db"))
    assert not (outside / "memory.db").exists()
