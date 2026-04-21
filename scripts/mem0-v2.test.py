#!/usr/bin/env python3
"""
Unit tests for Memory v2 (SQLite + FTS5 + RRF)
"""

import os
import sys
import json
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

# Import module
scripts_dir = Path(__file__).parent
sys.path.insert(0, str(scripts_dir))
import importlib.util
spec = importlib.util.spec_from_file_location("mem0_v2", scripts_dir / "mem0-v2.py")
mem0_v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mem0_v2)

MemoryDB = mem0_v2.MemoryDB
redact_secrets = mem0_v2.redact_secrets
make_hash = mem0_v2.make_hash
estimate_tokens = mem0_v2.estimate_tokens
CATEGORY_WEIGHTS = mem0_v2.CATEGORY_WEIGHTS


def create_fresh_db():
    """Create a fresh database with schema."""
    db = MemoryDB(tempfile.mktemp(suffix='.db'))
    # Clear any default data
    conn = db.get_connection()
    conn.execute("DELETE FROM observation_links")
    conn.execute("DELETE FROM observations")
    conn.execute("DELETE FROM sessions")
    conn.commit()
    conn.close()
    return db


def cleanup_db(db):
    """Clean up database files."""
    if hasattr(db, 'db_path'):
        for suffix in ['', '-wal', '-shm']:
            path = db.db_path + suffix
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass


def run_tests():
    """Run all tests and report results."""
    import uuid
    passed = 0
    failed = 0
    errors = []

    def test(name, fn):
        nonlocal passed, failed
        try:
            fn()
            print(f"  ✓ {name}")
            passed += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
            errors.append((name, str(e)))

    # Helper tests
    print("\nTesting helper functions...")

    def test_redact_api_keys():
        assert "[REDACTED]" in redact_secrets("api key: sk-1234567890abcdefghijklmnop")
    test("redact_secrets API keys", test_redact_api_keys)

    def test_redact_passwords():
        assert "[REDACTED]" in redact_secrets("password: mysecretpass")
    test("redact_secrets passwords", test_redact_passwords)

    def test_redact_postgres():
        assert "[REDACTED]" in redact_secrets("postgres://user:pass@host/db")
    test("redact_secrets postgres", test_redact_postgres)

    def test_redact_unchanged():
        assert redact_secrets("normal text") == "normal text"
    test("redact_secrets unchanged text", test_redact_unchanged)

    def test_make_hash_deterministic():
        h1 = make_hash("test content")
        h2 = make_hash("test content")
        assert h1 == h2
    test("make_hash deterministic", test_make_hash_deterministic)

    def test_make_hash_different():
        assert make_hash("a") != make_hash("b")
    test("make_hash different inputs", test_make_hash_different)

    def test_make_hash_length():
        assert len(make_hash("test")) == 16
    test("make_hash 16-char length", test_make_hash_length)

    def test_estimate_tokens():
        assert estimate_tokens("a" * 400) == 100
    test("estimate_tokens 400 chars = 100 tokens", test_estimate_tokens)

    # Layer 1 tests
    print("\nTesting Layer 1: Compact Index...")
    db = create_fresh_db()
    try:
        db.add("Test memory about authentication", category="decisions")
        result = db.memory_index("authentication")
        assert result['layer'] == 1
        assert 'results' in result
        assert 'total_score' in result
        assert 'tokens_estimate' in result
        test("memory_index returns layer 1", lambda: None)
    except Exception as e:
        test("memory_index returns layer 1", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # Layer 2 tests
    print("\nTesting Layer 2: FTS5 Search...")
    db = create_fresh_db()
    try:
        db.add("Authentication module using JWT tokens", category="decisions")
        result = db.memory_search("authentication")
        assert result['layer'] == 2
        assert 'results' in result
        test("memory_search returns layer 2", lambda: None)
    except Exception as e:
        test("memory_search returns layer 2", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        entry = db.add("Access count test memory", category="general")
        db.memory_search("access count test")
        db.memory_search("access count test")
        obs = db.memory_get(entry['id'])
        assert obs['access_count'] == 2
        test("memory_search increments access count", lambda: None)
    except Exception as e:
        test("memory_search increments access count", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # Layer 3 tests
    print("\nTesting Layer 3: Full Detail...")
    db = create_fresh_db()
    try:
        entry = db.add(
            "Full detail test",
            category="decisions",
            title="Test Title",
            tags=["test", "detail"]
        )
        obs = db.memory_get(entry['id'])
        assert obs is not None
        assert obs['title'] == "Test Title"
        assert '"test"' in obs['tags']
        assert 'links' in obs
        test("memory_get returns full observation", lambda: None)
    except Exception as e:
        test("memory_get returns full observation", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        obs = db.memory_get(99999)
        assert obs is None
        test("memory_get returns None for missing", lambda: None)
    except Exception as e:
        test("memory_get returns None for missing", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # CRUD tests
    print("\nTesting CRUD operations...")
    db = create_fresh_db()
    try:
        entry = db.add("Test memory", category="general")
        assert entry is not None
        assert 'id' in entry
        assert entry['duplicate'] is False
        test("add_observation creates entry", lambda: None)
    except Exception as e:
        test("add_observation creates entry", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        db.add("Duplicate test memory", category="general")
        dup = db.add("Duplicate test memory", category="general")
        assert dup['duplicate'] is True
        test("add detects duplicates", lambda: None)
    except Exception as e:
        test("add detects duplicates", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        entry = db.add("Memory with tags", category="decisions", tags=["auth", "jwt"])
        obs = db.memory_get(entry['id'])
        assert '"auth"' in obs['tags']
        assert '"jwt"' in obs['tags']
        test("add with tags", lambda: None)
    except Exception as e:
        test("add with tags", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        db.add(f"Memory 1 {uuid.uuid4().hex[:8]}", category="general")
        db.add(f"Memory 2 {uuid.uuid4().hex[:8]}", category="decisions")
        db.add(f"Memory 3 {uuid.uuid4().hex[:8]}", category="architecture")
        results = db.list_all()
        assert len(results) == 3
        test("list_all returns all observations", lambda: None)
    except Exception as e:
        test("list_all returns all observations", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        db.add(f"General {uuid.uuid4().hex[:8]}", category="general")
        db.add(f"Decision 1 {uuid.uuid4().hex[:8]}", category="decisions")
        db.add(f"Decision 2 {uuid.uuid4().hex[:8]}", category="decisions")
        results = db.list_all(category="decisions")
        assert len(results) == 2
        assert all(r['type'] == 'decisions' for r in results)
        test("list_all with category filter", lambda: None)
    except Exception as e:
        test("list_all with category filter", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        entry = db.add("To be deleted", category="general")
        db.delete(entry['id'])
        results = db.list_all()
        assert all(r['id'] != entry['id'] for r in results)
        conn = db.get_connection()
        cursor = conn.execute("SELECT archived FROM observations WHERE id = ?", (entry['id'],))
        row = cursor.fetchone()
        assert row['archived'] == 1
        test("delete archives (soft delete)", lambda: None)
    except Exception as e:
        test("delete archives (soft delete)", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # Statistics tests
    print("\nTesting statistics...")
    db = create_fresh_db()
    try:
        assert db.count() == 0
        db.add(f"Memory 1 {uuid.uuid4().hex[:8]}", category="general")
        db.add(f"Memory 2 {uuid.uuid4().hex[:8]}", category="decisions")
        assert db.count() == 2
        test("count active observations", lambda: None)
    except Exception as e:
        test("count active observations", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        db.add(f"Memory 1 {uuid.uuid4().hex[:8]}", category="general")
        db.add(f"Memory 2 {uuid.uuid4().hex[:8]}", category="decisions")
        db.add(f"Memory 3 {uuid.uuid4().hex[:8]}", category="decisions")
        stats = db.stats()
        assert stats['total'] == 3
        assert stats['by_type']['general'] == 1
        assert stats['by_type']['decisions'] == 2
        assert stats['size_bytes'] > 0
        test("stats returns correct data", lambda: None)
    except Exception as e:
        test("stats returns correct data", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # GC tests
    print("\nTesting garbage collection...")
    db = create_fresh_db()
    try:
        for i in range(50):
            db.add(f"Memory {i} {uuid.uuid4().hex[:8]}", category="ingested")
        removed = db.gc(max_obs=10)
        assert removed > 0
        assert db.count() <= 10
        test("gc archives low-value observations", lambda: None)
    except Exception as e:
        test("gc archives low-value observations", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        conn = db.get_connection()
        conn.execute("""
            INSERT INTO observations (project_root, type, title, content, content_hash, pinned)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("test", "general", "Pinned Memory", "content", f"hash_{uuid.uuid4().hex[:8]}", 1))
        conn.commit()
        conn.close()
        for i in range(50):
            db.add(f"Memory {i} {uuid.uuid4().hex[:8]}", category="ingested")
        removed = db.gc(max_obs=5)
        assert db.count() >= 1
        test("gc preserves pinned", lambda: None)
    except Exception as e:
        test("gc preserves pinned", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        db.add(f"Memory 1 {uuid.uuid4().hex[:8]}", category="general")
        db.add(f"Memory 2 {uuid.uuid4().hex[:8]}", category="decisions")
        removed = db.gc(max_obs=100)
        assert removed == 0
        assert db.count() == 2
        test("gc does nothing when under limit", lambda: None)
    except Exception as e:
        test("gc does nothing when under limit", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # RRF Fusion tests
    print("\nTesting RRF Fusion...")
    db = create_fresh_db()
    try:
        list1 = [{'id': 1, 'score': 10}, {'id': 2, 'score': 5}]
        list2 = [{'id': 2, 'score': 8}, {'id': 3, 'score': 3}]
        result = db.rrf_merge(list1, list2)
        assert result[0]['id'] == 2  # ID 2 ranked in both
        test("rrf_merge ranks by reciprocal rank", lambda: None)
    except Exception as e:
        test("rrf_merge ranks by reciprocal rank", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        result = db.rrf_merge([], [])
        assert result == []
        test("rrf_merge handles empty lists", lambda: None)
    except Exception as e:
        test("rrf_merge handles empty lists", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        list1 = [{'id': 1}, {'no_id': True}, {'id': 2}]
        result = db.rrf_merge(list1)
        assert len(result) == 2
        test("rrf_merge handles missing IDs", lambda: None)
    except Exception as e:
        test("rrf_merge handles missing IDs", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # Migration tests
    print("\nTesting JSONL migration...")
    db = create_fresh_db()
    try:
        jsonl_content = json.dumps({
            "memory": f"Migrated memory {uuid.uuid4().hex[:8]}",
            "category": "decisions",
            "source": "test",
            "created": datetime.now().isoformat()
        }) + "\n"
        jsonl_path = tempfile.mktemp(suffix='.jsonl')
        Path(jsonl_path).write_text(jsonl_content)
        result = db.migrate_from_jsonl(jsonl_path)
        assert result['migrated'] == 1
        assert result['skipped'] == 0
        assert db.count() == 1
        os.remove(jsonl_path)
        test("migrate from JSONL", lambda: None)
    except Exception as e:
        test("migrate from JSONL", lambda: _raise(e))
    finally:
        cleanup_db(db)

    db = create_fresh_db()
    try:
        result = db.migrate_from_jsonl("/nonexistent/file.jsonl")
        assert result['migrated'] == 0
        assert result['skipped'] == 0
        test("migrate handles missing file", lambda: None)
    except Exception as e:
        test("migrate handles missing file", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # Backward compatibility
    print("\nTesting backward compatibility...")
    db = create_fresh_db()
    try:
        db.add(f"Backward compat test {uuid.uuid4().hex[:8]}", category="decisions")
        results = db.search("backward")
        assert len(results) > 0
        assert 'id' in results[0]
        assert 'type' in results[0]
        assert 'title' in results[0]
        assert 'memory' in results[0]
        assert 'category' in results[0]
        test("search returns backward-compatible format", lambda: None)
    except Exception as e:
        test("search returns backward-compatible format", lambda: _raise(e))
    finally:
        cleanup_db(db)

    # Summary
    print("\n" + "=" * 50)
    if failed == 0:
        print(f"✅ All {passed} tests passed!")
    else:
        print(f"❌ {passed} passed, {failed} failed:")
        for name, error in errors:
            print(f"   - {name}: {error}")
    print("=" * 50)
    return failed == 0


def _raise(e):
    raise e


if __name__ == "__main__":
    print("Running Memory v2 Tests...\n")
    success = run_tests()
    sys.exit(0 if success else 1)
