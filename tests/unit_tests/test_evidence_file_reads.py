"""Bound final, linked and review reads even when a path names a FIFO.

The subprocess timeout is a watchdog for the old blocking-open regression;
all subprocesses run only when the parent admits this verifier suite.
"""

import os
from pathlib import Path
import subprocess
import sys
import tempfile

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def special_root(tmp_path):
    # The admitted verifier explicitly owns and separately accounts this tiny
    # special-file fixture area. Ordinary job output remains regular-file-only.
    selected = os.environ.get("FORGEWRIGHT_SPECIAL_FILE_FIXTURES")
    if not selected:
        yield tmp_path
        return
    with tempfile.TemporaryDirectory(prefix="evidence-", dir=selected) as name:
        yield Path(name)

READ_CHECK = """
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from evidence_common import read_evidence_json
from verify_gate import _linked_record_errors, _validate_hard_requirements
root, mode = Path(sys.argv[2]), sys.argv[3]
path = root / '.forgewright/verify/unsafe.json'
if mode == 'final':
    try:
        read_evidence_json(root, path)
    except ValueError as error:
        assert 'regular' in str(error), str(error)
    else:
        raise AssertionError('unsafe final evidence was accepted')
elif mode == 'linked':
    errors, records = _linked_record_errors({'links': {'contract': path.name}}, root)
    assert not records
    assert any('regular' in error for error in errors), errors
else:
    errors = _validate_hard_requirements({
        'risk': 'hard', 'tier': 'runtime', 'implementer_id': 'fixture-builder',
        'reviewer': {'status': 'independent-approved', 'id': 'fixture-reviewer',
                     'evidence_ref': path.name},
    }, True, root)
    assert any('regular' in error for error in errors), errors
print('unsafe evidence rejected')
"""


@pytest.mark.parametrize("entrypoint", ["final", "linked", "review"])
@pytest.mark.parametrize("kind", ["fifo", "symlink"])
def test_evidence_entrypoints_reject_special_files_with_bounded_wait(special_root, entrypoint, kind):
    folder = special_root / ".forgewright/verify"
    folder.mkdir(parents=True)
    path = folder / "unsafe.json"
    if kind == "fifo":
        os.mkfifo(path, 0o600)
    else:
        target = special_root / "external.json"
        target.write_text('{}')
        path.symlink_to(target)
    result = subprocess.run(
        [sys.executable, "-B", "-c", READ_CHECK, str(ROOT / "scripts/lite"),
         str(special_root), entrypoint],
        capture_output=True, text=True, timeout=3,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "unsafe evidence rejected"
