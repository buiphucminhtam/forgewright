"""
Pytest configuration.
"""

import sys
from pathlib import Path

# Add scripts/ to sys.path
_project_root = Path(__file__).parent.parent.resolve()
_scripts = _project_root / "scripts"

if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))


def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (requires services)"
    )
    config.addinivalue_line("markers", "unit: mark test as unit test")
