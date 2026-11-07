"""Runtime contract tests for scripts/lite/pipeline_transition_gate.py."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "scripts/lite/pipeline_transition_gate.py"
sys.path.insert(0, str(ROOT / "scripts/lite"))

from evidence_common import execution_manifest, sha256_text, worktree_fingerprint  # noqa: E402
from tests.unit_tests.test_continuity_gate import _docs_contract  # noqa: E402

RUN = str(uuid.uuid4())


def _git(path: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=path, check=True, capture_output=True)


@pytest.fixture()
def ws(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-q", "-b", "main")
    _git(tmp_path, "config", "user.email", "t@example.com")
    _git(tmp_path, "config", "user.name", "T")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests/check.py").write_text("print('ok')\n", encoding="utf-8")
    (tmp_path / "README.md").write_text("fixture\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-qm", "init")
    return tmp_path


def _research(ws: Path, **overrides: object) -> Path:
    record: dict[str, object] = {
        "schema_version": 1,
        "run_id": RUN,
        "queries": [],
        "sources": [{"url": "local:tests/check.py", "revision": "worktree"}],
        "candidates": [],
        "decision": "not_applicable",
        "reason": "local mechanical edit fixed by existing code",
        "status": "supported",
    }
    record.update(overrides)
    path = ws / ".forgewright/research" / f"{RUN}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record), encoding="utf-8")
    return path


def _evidence(ws: Path, turn: str = "turn-1", offset: int = 0) -> Path:
    command = [sys.executable, "tests/check.py"]
    refs = ["tests/check.py"]
    execution, diagnostics = execution_manifest(ws, command, refs)
    assert execution is not None, diagnostics
    stamp = datetime.now(timezone.utc) + timedelta(seconds=offset)
    record = {
        "schema_version": "2",
        "turn": turn,
        "acceptance_criteria": [
            {"id": "ok", "claim": "check prints ok", "test_refs": refs}
        ],
        "command": command,
        "execution": execution,
        "tier": "contract",
        "test_refs": refs,
        "negative_paths": ["check fails when absent"],
        "negative_path_bindings": [
            {
                "id": "negative-path-1",
                "claim": "check fails when absent",
                "acceptance_ids": ["ok"],
                "test_refs": refs,
            }
        ],
        "limitations": [],
        "change_kind": "test",
        "phase": "verification",
        "implementer_id": "gate-test-implementer",
        "reviewer": {"status": "not_required"},
        "exit_code": 0,
        "output": "ok\n",
        "output_sha256": sha256_text("ok\n"),
        "output_truncated": False,
        "timestamp_utc": stamp.isoformat(timespec="microseconds").replace(
            "+00:00", "Z"
        ),
        "workspace": str(ws.resolve()),
        "tree_sha": worktree_fingerprint(ws),
    }
    path = ws / ".forgewright/verify" / f"{turn}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record), encoding="utf-8")
    return path


def _started(offset: int = -60) -> str:
    return (
        (datetime.now(timezone.utc) + timedelta(seconds=offset))
        .isoformat()
        .replace("+00:00", "Z")
    )


def _gate(
    ws: Path, *extra: str, phase: str = "1", kind: str = "mechanical", run: str = RUN
):
    env = {
        k: os.environ[k]
        for k in ("PATH", "HOME", "TMPDIR", "LANG", "SYSTEMROOT")
        if k in os.environ
    }
    args = [
        sys.executable,
        "-I",
        "-B",
        str(GATE),
        "--workspace",
        str(ws),
        "--run-id",
        run,
        "--phase",
        phase,
        "--kind",
        kind,
        *extra,
    ]
    result = subprocess.run(
        args, cwd=ws, env=env, capture_output=True, text=True, timeout=120
    )
    payload = json.loads(result.stdout)
    assert set(payload) == {"allow", "reasons", "limitations"}
    assert (result.returncode == 0) == payload["allow"], result.stdout + result.stderr
    return result.returncode, payload


def test_mechanical_research_record_allows_definition_exit(ws: Path) -> None:
    _research(ws)
    code, payload = _gate(ws)
    assert code == 0 and payload["reasons"] == []
    assert any("authenticity" in item for item in payload["limitations"])


@pytest.mark.parametrize(
    "mutate", ["missing", "malformed", "provisional", "wrong_run", "symlink"]
)
def test_unsafe_or_unsupported_research_denies(ws: Path, mutate: str) -> None:
    if mutate == "malformed":
        _research(ws).write_text("{not json", encoding="utf-8")
    elif mutate == "provisional":
        _research(ws, status="provisional")
    elif mutate == "wrong_run":
        _research(ws, run_id=str(uuid.uuid4()))
    elif mutate == "symlink":
        real = ws / "elsewhere.json"
        real.write_text(_research(ws).read_text(encoding="utf-8"), encoding="utf-8")
        link = ws / ".forgewright/research" / f"{RUN}.json"
        link.unlink()
        link.symlink_to(real)
    code, payload = _gate(ws)
    assert code != 0 and payload["reasons"]


def test_new_project_requires_external_reuse_discovery(ws: Path) -> None:
    _research(ws)
    code, payload = _gate(ws, kind="new-project")
    assert code != 0
    assert any("decision" in r or "queries" in r for r in payload["reasons"])


def test_material_kind_requires_current_docs_even_without_docs_edits(ws: Path) -> None:
    _research(ws)
    code, payload = _gate(ws, kind="existing")
    assert code != 0 and any(r.startswith("docs:") for r in payload["reasons"])


def test_material_kind_allows_with_current_real_docs_receipt(ws: Path) -> None:
    _docs_contract(ws)
    _research(ws)
    code, payload = _gate(ws, kind="existing")
    assert code == 0, payload


def test_rejects_unknown_or_trust_flags_and_bad_run_id(ws: Path) -> None:
    _research(ws)
    assert _gate(ws, "--skip-docs")[0] != 0
    assert _gate(ws, run="not-a-uuid")[0] != 0
    assert _gate(ws, phase="3")[0] != 0  # final phase without --turn/--started-at


def test_phase_two_is_state_only(ws: Path) -> None:
    assert _gate(ws, phase="2")[0] == 0


def test_final_exact_turn_evidence_allows_and_tree_change_denies(ws: Path) -> None:
    _research(ws)
    _evidence(ws)
    args = ("--turn", "turn-1", "--started-at", _started())
    code, payload = _gate(ws, *args, phase="3")
    assert code == 0, payload
    (ws / "tests/check.py").write_text("print('changed')\n", encoding="utf-8")
    code, payload = _gate(ws, *args, phase="4")
    assert code != 0 and any("tree" in r.lower() for r in payload["reasons"])


def test_final_rejects_other_turn_and_pre_run_evidence(ws: Path) -> None:
    _research(ws)
    _evidence(ws, turn="turn-1", offset=-30)
    assert (
        _gate(ws, "--turn", "turn-2", "--started-at", _started(-60), phase="3")[0] != 0
    )
    code, payload = _gate(
        ws, "--turn", "turn-1", "--started-at", _started(0), phase="3"
    )
    assert code != 0 and any("started" in r for r in payload["reasons"])


def test_bounded_search_with_no_candidate_does_not_require_invented_reuse(
    ws: Path,
) -> None:
    _docs_contract(ws)
    _research(
        ws,
        queries=["existing alternatives"],
        sources=[
            {"url": "https://example.org/catalog", "revision": "inspected fixture"}
        ],
        decision="build",
        reason="Bounded search found no compatible license/stack; build the small missing component",
    )
    assert _gate(ws, kind="new-project")[0] == 0
    _research(
        ws,
        queries=["existing alternatives"],
        sources=[
            {"url": "https://example.org/catalog", "revision": "inspected fixture"}
        ],
        decision="reuse",
    )
    assert _gate(ws, kind="new-project")[0] != 0


def test_real_docs_cli_build_satisfies_material_baseline(ws: Path) -> None:
    cli = ROOT / "src/cli/dist/index.js"
    for command in ("init", "build"):
        completed = subprocess.run(
            ["node", str(cli), "docs", command, str(ws), "--json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert completed.returncode == 0, completed.stdout + completed.stderr
    _research(ws)
    code, payload = _gate(ws, kind="existing")
    assert code == 0, payload


def test_replay_cannot_mutate_covered_tree_and_still_admit(ws: Path) -> None:
    _research(ws)
    (ws / "tests/check.py").write_text(
        "from pathlib import Path\nPath('README.md').write_text('mutated during replay')\nprint('ok')\n",
        encoding="utf-8",
    )
    _evidence(ws)
    code, payload = _gate(ws, "--turn", "turn-1", "--started-at", _started(), phase="3")
    assert code != 0 and any(
        "tree" in reason.lower() for reason in payload["reasons"]
    ), payload


def test_mechanical_final_cannot_skip_changed_stale_docs(ws: Path) -> None:
    _docs_contract(ws)
    _research(ws)
    (ws / "docs/guide.md").write_text("# Changed after build\n", encoding="utf-8")
    _evidence(ws)
    code, payload = _gate(ws, "--turn", "turn-1", "--started-at", _started(), phase="3")
    assert code != 0 and any(
        reason.startswith("docs:") for reason in payload["reasons"]
    ), payload


def test_real_large_docs_catalog_is_bounded_and_still_checks_sources(ws: Path) -> None:
    cli = ROOT / "src/cli/dist/index.js"
    subprocess.run(
        ["node", str(cli), "docs", "init", str(ws), "--json"],
        check=True,
        capture_output=True,
        timeout=30,
    )
    manifest_path = ws / ".forgewright/docs-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["sources"].append({"path": "docs/guide.md", "type": "documentation"})
    manifest["privacy"]["allow"].append("docs/guide.md")
    manifest_path.write_text(json.dumps(manifest))
    guide = ws / "docs/guide.md"
    guide.write_text(
        "# Guide\n" + "Verified project documentation.\n" * 21000, encoding="utf-8"
    )
    subprocess.run(
        ["node", str(cli), "docs", "build", str(ws), "--json"],
        check=True,
        capture_output=True,
        timeout=30,
    )
    cache = ws / ".forgewright/cache/docs-index.json"
    assert 512 * 1024 < cache.stat().st_size < 16 * 1024 * 1024
    _research(ws)
    code, payload = _gate(ws, kind="existing")
    assert code == 0, payload
    original = guide.read_bytes()
    guide.write_text("# Modified after build\n", encoding="utf-8")
    assert _gate(ws, kind="existing")[0] != 0
    guide.write_bytes(original)
    with cache.open("ab") as handle:
        handle.write(b" " * (16 * 1024 * 1024 + 1 - cache.stat().st_size))
    code, payload = _gate(ws, kind="existing")
    assert code != 0 and any(
        "docs_build_receipt_invalid" in reason for reason in payload["reasons"]
    ), payload


@pytest.mark.parametrize("kind", ["existing", "mechanical"])
def test_deleted_docs_require_rebuilt_catalog_but_not_a_commit(
    ws: Path, kind: str
) -> None:
    cli = ROOT / "src/cli/dist/index.js"
    subprocess.run(
        ["node", str(cli), "docs", "init", str(ws), "--json"],
        check=True,
        capture_output=True,
    )
    manifest_path = ws / ".forgewright/docs-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["sources"].append({"path": "docs", "type": "documentation"})
    manifest["privacy"]["allow"].append("docs")
    manifest_path.write_text(json.dumps(manifest))
    guide = ws / "docs/guide.md"
    guide.write_text("# Delete me\n")
    subprocess.run(
        ["node", str(cli), "docs", "build", str(ws), "--json"],
        check=True,
        capture_output=True,
    )
    _git(ws, "add", "docs", ".forgewright/docs-manifest.json")
    _git(ws, "commit", "-qm", "docs baseline")
    _git(ws, "rm", "docs/guide.md")
    _research(ws)
    args = ("--turn", "turn-1", "--started-at", _started())
    _evidence(ws)
    assert _gate(ws, *args, phase="3", kind=kind)[0] != 0
    subprocess.run(
        ["node", str(cli), "docs", "build", str(ws), "--json"],
        check=True,
        capture_output=True,
    )
    _evidence(ws)
    code, payload = _gate(ws, *args, phase="3", kind=kind)
    assert code == 0, payload
