"""
Pytest configuration.
"""

import sys
from pathlib import Path

import os
import pytest

# Add scripts/ to sys.path
_project_root = Path(__file__).parent.parent.resolve()
_scripts = _project_root / "scripts"

if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))


@pytest.fixture(autouse=True)
def isolate_memory_test_environment(request, monkeypatch, tmp_path):
    """Memory tests own their stores, even on configured developer machines."""
    name = Path(request.module.__file__).name
    if not name.startswith(("test_memory_", "test_mem0")):
        return
    for key in tuple(os.environ):
        if key.startswith(("MEM0_", "MEMORY_", "FORGEWRIGHT_SESSION")) or key in {
            "FORGEWRIGHT_SKIP_MEM0",
            "FORGEWRIGHT_CONTEXT_SKIP_DB",
        }:
            monkeypatch.delenv(key)
    monkeypatch.setenv("FORGEWRIGHT_WORKSPACE", str(tmp_path))


def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (requires services)"
    )
    config.addinivalue_line("markers", "unit: mark test as unit test")
