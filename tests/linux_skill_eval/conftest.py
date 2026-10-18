"""Fail unsupported explicit lane selection; never skip or fake native evidence."""

import sys
from pathlib import Path

import pytest


def pytest_configure(config):
    if sys.platform != "linux" or not Path("/proc/self/stat").is_file():
        raise pytest.UsageError(
            "tests/linux_skill_eval requires Linux /proc/prctl capture capabilities; "
            "the portable suite is tests/unit_tests"
        )
