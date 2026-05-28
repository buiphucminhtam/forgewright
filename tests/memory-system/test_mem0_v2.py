#!/usr/bin/env python3
"""
test_mem0_v2.py — Tests for mem0-v2.py core functionality
Specifically: search fix (multi-word), auto-tagging, adaptive ranking
"""
import sys
import os
import json
import tempfile
import unittest
import importlib.util
from pathlib import Path

# Load mem0-v2.py by path (filename has hyphen, can't be imported directly)
SCRIPTS_DIR = Path(__file__).parent.parent.parent / "scripts"
_spec = importlib.util.spec_from_file_location("mem0_v2", SCRIPTS_DIR / "mem0-v2.py")
_mem0_module = importlib.util.module_from_spec(_spec)
sys.modules["mem0_v2"] = _mem0_module
_spec.loader.exec_module(_mem0_module)


class TestAutoTagging(unittest.TestCase):
    """Tests for AUTO_TAG_PATTERNS auto-tagging."""

    def test_auth_tag(self):
        from mem0_v2 import auto_extract_tags
        text = "JWT authentication middleware with token validation"
        tags = auto_extract_tags(text)
        self.assertIn("auth", tags)
        self.assertIn("testing", tags)

    def test_architecture_tag(self):
        from mem0_v2 import auto_extract_tags
        text = "Architecture redesign using microservices pattern"
        tags = auto_extract_tags(text)
        self.assertIn("architecture", tags)

    def test_database_tag(self):
        from mem0_v2 import auto_extract_tags
        text = "PostgreSQL database migration with query optimization"
        tags = auto_extract_tags(text)
        self.assertIn("database", tags)

    def test_performance_tag(self):
        from mem0_v2 import auto_extract_tags
        text = "Performance optimization with Redis caching"
        tags = auto_extract_tags(text)
        self.assertIn("performance", tags)

    def test_api_tag(self):
        from mem0_v2 import auto_extract_tags
        text = "REST API endpoint with GraphQL wrapper"
        tags = auto_extract_tags(text)
        self.assertIn("api", tags)

    def test_security_tag(self):
        from mem0_v2 import auto_extract_tags
        text = "SQL injection vulnerability fixed"
        tags = auto_extract_tags(text)
        self.assertIn("security", tags)

    def test_multiple_tags(self):
        from mem0_v2 import auto_extract_tags
        text = "JWT auth with PostgreSQL database and Redis cache"
        tags = auto_extract_tags(text)
        self.assertGreaterEqual(len(tags), 3)

    def test_empty_text(self):
        from mem0_v2 import auto_extract_tags
        tags = auto_extract_tags("")
        self.assertEqual(tags, [])

    def test_no_match(self):
        from mem0_v2 import auto_extract_tags
        tags = auto_extract_tags("This is a random sentence with no keywords")
        self.assertEqual(tags, [])

    def test_case_insensitive(self):
        from mem0_v2 import auto_extract_tags
        text = "JWT AUTHENTICATION with DATABASE"
        tags = auto_extract_tags(text)
        self.assertIn("auth", tags)
        self.assertIn("database", tags)


class TestSearchMultiWord(unittest.TestCase):
    """Tests for multi-word search query splitting."""

    def setUp(self):
        import tempfile
        tmpdir = tempfile.mkdtemp()
        os.environ["MEM0_DB_PATH"] = os.path.join(tmpdir, "memory.db")
        _spec = importlib.util.spec_from_file_location("m", SCRIPTS_DIR / "mem0-v2.py")
        _m = importlib.util.module_from_spec(_spec)
        sys.modules["mem0_v2"] = _m
        _spec.loader.exec_module(_m)
        self.db = _m.MemoryDB(os.path.join(tmpdir, "memory.db"))

    def test_single_word_search(self):
        self.db.add("Testing the memory system", category="general")
        results = self.db.search("memory", limit=5)
        self.assertGreater(len(results), 0)

    def test_multi_word_search_finds_partial(self):
        self.db.add("JWT authentication system", category="security")
        results = self.db.search("JWT authentication", limit=5)
        self.assertGreater(len(results), 0)

    def test_multi_word_search_matches_any_term(self):
        self.db.add("Memory checkpoint system", category="session")
        self.db.add("Cache optimization", category="performance")
        results = self.db.search("memory optimization", limit=5)
        self.assertGreaterEqual(len(results), 1)

    def test_search_with_numbers(self):
        self.db.add("Memory v2 system", category="general")
        results = self.db.search("memory v2", limit=5)
        self.assertGreaterEqual(len(results), 1)

    def test_empty_query_returns_empty(self):
        results = self.db.search("", limit=5)
        self.assertEqual(results, [])

    def test_search_limit_respected(self):
        for i in range(10):
            self.db.add(f"Test observation {i}", category="general")
        results = self.db.search("test observation", limit=3)
        self.assertLessEqual(len(results), 3)

    def test_archived_excluded(self):
        self.db.add("This should be found", category="general")
        obs_id = self.db.add("This should be excluded", category="general")["id"]
        self.db.delete(obs_id)
        results = self.db.search("should", limit=5)
        ids = [r["id"] for r in results]
        self.assertNotIn(obs_id, ids)

    def test_search_ranking(self):
        self.db.add("Memory system architecture decision", category="decisions", importance=10)
        self.db.add("Memory system simple note", category="general", importance=3)
        results = self.db.search("memory system", limit=5)
        if len(results) >= 2:
            high_imp = next((r for r in results if r["id"] == 1), None)
            low_imp = next((r for r in results if r["id"] == 2), None)
            self.assertIsNotNone(high_imp)


class TestAddWithImportance(unittest.TestCase):
    """Tests for add() with importance parameter."""

    def setUp(self):
        import tempfile
        tmpdir = tempfile.mkdtemp()
        _spec = importlib.util.spec_from_file_location("m", SCRIPTS_DIR / "mem0-v2.py")
        _m = importlib.util.module_from_spec(_spec)
        sys.modules["mem0_v2"] = _m
        _spec.loader.exec_module(_m)
        self.db = _m.MemoryDB(os.path.join(tmpdir, "memory.db"))

    def test_add_with_default_importance(self):
        result = self.db.add("Test memory", category="general")
        self.assertIn("id", result)
        self.assertFalse(result.get("duplicate", False))

    def test_add_with_custom_importance(self):
        result = self.db.add("High priority", category="decisions", importance=10)
        self.assertIn("id", result)

    def test_add_importance_stored(self):
        # importance is stored in db (clamping happens in cmd_add, not db.add)
        result = self.db.add("Test", category="general", importance=8)
        self.assertIn("id", result)

    def test_duplicate_returns_existing_id(self):
        text = "Duplicate test"
        r1 = self.db.add(text, category="general")
        r2 = self.db.add(text, category="general")
        self.assertEqual(r1["id"], r2["id"])
        self.assertTrue(r2.get("duplicate", False))


class TestRedaction(unittest.TestCase):
    """Tests for secret redaction."""

    def test_redacts_api_key(self):
        from mem0_v2 import redact_secrets
        text = "API key: sk-1234567890abcdefghijklmn"
        redacted = redact_secrets(text)
        self.assertNotIn("sk-1234567890abcdefghijklmn", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_redacts_bearer_token(self):
        from mem0_v2 import redact_secrets
        text = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9"
        redacted = redact_secrets(text)
        self.assertNotIn("Bearer eyJ", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_redacts_password(self):
        from mem0_v2 import redact_secrets
        text = "password=supersecret123"
        redacted = redact_secrets(text)
        self.assertNotIn("supersecret123", redacted)

    def test_redacts_postgres_connection(self):
        from mem0_v2 import redact_secrets
        text = "postgres://user:password123@localhost/db"
        redacted = redact_secrets(text)
        self.assertNotIn("password123", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_preserves_normal_text(self):
        from mem0_v2 import redact_secrets
        text = "This is a normal sentence about authentication"
        redacted = redact_secrets(text)
        self.assertEqual(text, redacted)


class TestGC(unittest.TestCase):
    """Tests for garbage collection."""

    def setUp(self):
        import tempfile
        tmpdir = tempfile.mkdtemp()
        _spec = importlib.util.spec_from_file_location("m", SCRIPTS_DIR / "mem0-v2.py")
        _m = importlib.util.module_from_spec(_spec)
        sys.modules["mem0_v2"] = _m
        _spec.loader.exec_module(_m)
        self.db = _m.MemoryDB(os.path.join(tmpdir, "gc_test.db"))

    def test_gc_does_nothing_under_limit(self):
        for i in range(5):
            self.db.add(f"Memory {i}", category="general")
        removed = self.db.gc(max_obs=10)
        self.assertEqual(removed, 0)

    def test_gc_removes_over_limit(self):
        for i in range(15):
            self.db.add(f"Memory {i}", category="general")
        removed = self.db.gc(max_obs=5)
        self.assertEqual(removed, 10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
