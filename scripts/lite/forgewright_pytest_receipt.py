"""Child-side pytest observer. Its output is consumed only by the parent runner."""

from __future__ import annotations

import json
import os
from pathlib import Path

_tests: dict[str, dict] = {}
_deselected: list[str] = []
_duplicates = False
_distributed = False
_workspace = Path.cwd().resolve()
_rootpath = _workspace


def pytest_configure(config):
    global _distributed, _rootpath
    _rootpath = Path(config.rootpath).resolve()
    _distributed = bool(
        config.getoption("numprocesses", default=None)
        or config.getoption("tx", default=[])
        or config.getoption("dist", default="no") not in {None, "no"}
        or hasattr(config, "workerinput")
        or os.environ.get("PYTEST_XDIST_WORKER")
    )


def _nodeid(value):
    file, separator, suffix = value.partition("::")
    path = (_rootpath / file).resolve()
    try:
        normalized = path.relative_to(_workspace).as_posix()
    except ValueError:
        normalized = "external:" + path.as_posix()
    return normalized + (separator + suffix if separator else "")


def pytest_itemcollected(item):
    nodeid = _nodeid(item.nodeid)
    _tests[nodeid] = {"nodeid": nodeid, "phases": {}, "wasxfail": False}


def pytest_deselected(items):
    _deselected.extend(_nodeid(item.nodeid) for item in items)


def pytest_runtest_logreport(report):
    global _duplicates
    nodeid = _nodeid(report.nodeid)
    row = _tests.setdefault(nodeid, {"nodeid": nodeid, "phases": {}, "wasxfail": False})
    if report.when in row["phases"]:
        _duplicates = True
    row["phases"][report.when] = report.outcome
    # Pytest represents strict XPASS as a failed call with this string,
    # without wasxfail. It still cannot prove an assertion failed (RED).
    strict_xpass = (
        report.when == "call"
        and report.failed
        and isinstance(report.longrepr, str)
        and report.longrepr.startswith("[XPASS(strict)] ")
    )
    row["wasxfail"] |= hasattr(report, "wasxfail") or strict_xpass


def pytest_sessionfinish(session, exitstatus):
    path = os.environ.get("FORGEWRIGHT_PYTEST_RECEIPT")
    if not path:
        return
    data = {
        "schema": "forgewright-pytest-execution/v1",
        "observer": "forgewright-pytest-receipt/v1",
        "run_id": os.environ.get("FORGEWRIGHT_PYTEST_RUN_ID"),
        "workspace": str(_workspace),
        "complete": True,
        "duplicate_reports": _duplicates,
        "distributed": _distributed,
        "exit_code": int(exitstatus),
        "tests": sorted(_tests.values(), key=lambda row: row["nodeid"]),
        "deselected": sorted(set(_deselected)),
    }
    Path(path).write_text(json.dumps(data, sort_keys=True), encoding="utf-8")
