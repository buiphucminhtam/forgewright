from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "scripts" / "parallel-dispatch-runner.py"
sys.path.insert(0, str(ROOT))


def policy_module():
    from scripts.runtime.orchestration_policy import decide_orchestration

    return decide_orchestration


def base_request(**overrides: object) -> dict[str, object]:
    request: dict[str, object] = {
        "task_id": "audit-1",
        "task_size": "large",
        "serial": False,
        "mechanical_inventory": False,
        "requirements": "Audit the requested scopes.",
        "diff": "diff --git a/a b/a",
        "raw_evidence": ["pytest: pass"],
        "scopes": [
            {
                "id": "backend",
                "paths": ["src/backend"],
                "independent": True,
                "risk_signals": [],
            },
            {
                "id": "frontend",
                "paths": ["src/frontend"],
                "independent": True,
                "risk_signals": [],
            },
            {
                "id": "schema",
                "paths": ["db/migrations"],
                "independent": True,
                "risk_signals": ["schema"],
            },
            {"id": "docs", "paths": ["docs"], "independent": True, "risk_signals": []},
        ],
        "limits": {
            "concurrency": 4,
            "remaining_token_budget": 6_000,
            "worker_token_budget": 2_000,
            "deadline_ms": 30_000,
        },
    }
    request.update(overrides)
    return request


def run_runner(
    manifest: Path,
    *flags: str,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    merged.update(env or {})
    if (
        "--execute" in flags
        and "--allow-external-code-sharing" in flags
        and (env is None or "HOME" not in env)
    ):
        home = manifest.parent / ".test-home"
        gate = (
            home / ".forgewright" / "scripts" / "lite" / "antigravity-pre-tool-gate.sh"
        )
        gate.parent.mkdir(parents=True, exist_ok=True)
        gate.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
        hooks = home / ".gemini" / "config" / "hooks.json"
        hooks.parent.mkdir(parents=True, exist_ok=True)
        hooks.write_text(
            json.dumps(
                {
                    "forgewright-policy": {
                        "PreToolUse": [
                            {
                                "matcher": "*",
                                "hooks": [
                                    {"type": "command", "command": f"bash {gate}"}
                                ],
                            }
                        ]
                    }
                }
            ),
            encoding="utf-8",
        )
        merged["HOME"] = str(home)
    return subprocess.run(
        [sys.executable, str(RUNNER), "--manifest", str(manifest), *flags],
        cwd=cwd or ROOT,
        env=merged,
        text=True,
        capture_output=True,
        check=False,
    )


def write_manifest(
    tmp_path: Path,
    request: dict[str, object],
    provider: dict[str, object] | None = None,
) -> Path:
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {"version": 1, "request": request, "provider": provider or {"cli": "agy"}}
        ),
        encoding="utf-8",
    )
    return path


@pytest.mark.parametrize("override", [{"task_size": "small"}, {"serial": True}])
def test_policy_uses_zero_workers_for_small_or_serial_work(
    override: dict[str, object],
) -> None:
    decision = policy_module()(base_request(**override))
    assert decision["worker_count"] == 0
    assert decision["workers"] == []


def test_policy_uses_one_scout_for_mechanical_inventory() -> None:
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    decision = policy_module()(request)
    assert decision["worker_count"] == 1
    assert decision["workers"][0]["role"] == "scout"


def test_policy_only_parallelizes_independent_scopes_and_applies_all_caps() -> None:
    decide = policy_module()
    decision = decide(base_request())
    assert decision["worker_count"] == 3
    assert [worker["scope_id"] for worker in decision["workers"]] == [
        "backend",
        "frontend",
        "schema",
    ]
    assert [worker["role"] for worker in decision["workers"]] == [
        "builder",
        "builder",
        "expert",
    ]

    concurrency_capped = decide(
        base_request(
            limits={
                "concurrency": 2,
                "remaining_token_budget": 9_000,
                "worker_token_budget": 2_000,
            }
        )
    )
    assert concurrency_capped["worker_count"] == 2
    budget_capped = decide(
        base_request(
            limits={
                "concurrency": 4,
                "remaining_token_budget": 2_000,
                "worker_token_budget": 2_000,
            }
        )
    )
    assert budget_capped["worker_count"] == 0
    exhausted = decide(
        base_request(
            limits={
                "concurrency": 0,
                "remaining_token_budget": 0,
                "worker_token_budget": 2_000,
            }
        )
    )
    assert exhausted["worker_count"] == 0
    dependent = decide(
        base_request(
            scopes=[
                {"id": "a", "paths": ["a"], "independent": True, "risk_signals": []},
                {"id": "b", "paths": ["b"], "independent": False, "risk_signals": []},
            ]
        )
    )
    assert dependent["worker_count"] == 0


def test_policy_reserves_budget_for_reviewer_and_reports_advisory_token_enforcement() -> (
    None
):
    decision = policy_module()(
        base_request(
            independent_review=True,
            limits={
                "concurrency": 4,
                "remaining_token_budget": 6_000,
                "worker_token_budget": 2_000,
                "deadline_ms": 30_000,
            },
        )
    )
    assert decision["worker_count"] == 2
    assert decision["caps"]["reviewer_reserved_budget_slots"] == 1
    assert decision["token_budget_enforcement"] == "advisory"
    assert decision["reviewer"]["token_budget"] == 2_000
    assert decision["reviewer"]["token_budget_enforcement"] == "advisory"
    assert all(
        worker["token_budget_enforcement"] == "advisory"
        for worker in decision["workers"]
    )


def test_policy_rejects_hard_token_cap_request() -> None:
    with pytest.raises(ValueError, match="hard token cap"):
        policy_module()(base_request(hard_token_cap=True))


@pytest.mark.parametrize("signal", ["security", "schema", "public-api", "concurrency"])
def test_policy_routes_high_risk_and_disagreement_to_expert(signal: str) -> None:
    scopes = [
        {"id": "a", "paths": ["a"], "independent": True, "risk_signals": [signal]},
        {"id": "b", "paths": ["b"], "independent": True, "risk_signals": []},
    ]
    decision = policy_module()(base_request(scopes=scopes))
    assert decision["workers"][0]["role"] == "expert"
    disagreement = policy_module()(base_request(scopes=scopes, disagreement=True))
    assert all(worker["role"] == "expert" for worker in disagreement["workers"])


def test_reviewer_packet_is_independent_and_stop_conditions_are_explicit() -> None:
    decision = policy_module()(base_request(independent_review=True))
    assert set(decision["reviewer"]["packet"]) == {
        "requirements",
        "diff",
        "raw_evidence",
    }
    assert decision["reviewer"]["role"] == "expert"
    assert decision["stop_conditions"] == [
        "duplicate_findings",
        "scope_covered",
        "same_blocker_twice",
        "advisory_token_budget",
        "deadline_cap",
    ]


def test_runner_is_dry_run_by_default_and_omits_unverified_model_flag(
    tmp_path: Path,
) -> None:
    manifest = write_manifest(
        tmp_path,
        base_request(
            task_size="medium",
            mechanical_inventory=True,
            scopes=[
                {
                    "id": "inventory",
                    "paths": ["src"],
                    "independent": True,
                    "risk_signals": [],
                }
            ],
        ),
    )
    result = run_runner(manifest)
    assert result.returncode == 0, result.stderr
    plan = json.loads(result.stdout)
    assert plan["execution"]["status"] == "dry-run"
    assert plan["workers"][0]["model_selection"]["status"] == "provider-managed"
    assert "--model" not in plan["workers"][0]["argv"]
    assert "Do not spawn subagents" in plan["workers"][0]["argv"][-1]

    invalid_capabilities = tmp_path / "invalid-capabilities.json"
    invalid_capabilities.write_text(
        '{"models":[{"id":"invented","verified":true}]}', encoding="utf-8"
    )
    unavailable_manifest = write_manifest(
        tmp_path,
        base_request(
            task_size="medium",
            mechanical_inventory=True,
            scopes=[
                {
                    "id": "inventory",
                    "paths": ["src"],
                    "independent": True,
                    "risk_signals": [],
                }
            ],
        ),
        {"cli": "agy", "capabilities_file": str(invalid_capabilities)},
    )
    unavailable = run_runner(unavailable_manifest)
    unavailable_plan = json.loads(unavailable.stdout)
    assert unavailable_plan["workers"][0]["model_selection"]["status"] == "unavailable"
    assert "--model" not in unavailable_plan["workers"][0]["argv"]


def test_runner_rejects_overlapping_paths_and_recursive_spawn(tmp_path: Path) -> None:
    overlap = base_request(
        scopes=[
            {"id": "a", "paths": ["src"], "independent": True, "risk_signals": []},
            {"id": "b", "paths": ["src/api"], "independent": True, "risk_signals": []},
        ]
    )
    result = run_runner(write_manifest(tmp_path, overlap))
    assert result.returncode != 0
    assert "overlap" in result.stderr.lower()

    recursive = base_request(recursive_spawn=True)
    result = run_runner(write_manifest(tmp_path, recursive))
    assert result.returncode != 0
    assert "recursive" in result.stderr.lower()


def test_external_execution_requires_both_explicit_flags(tmp_path: Path) -> None:
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    manifest = write_manifest(tmp_path, request)
    denied = run_runner(manifest, "--execute")
    assert denied.returncode != 0
    assert "external code sharing denied" in denied.stderr.lower()


def test_verified_capability_enables_model_flag_and_exec_uses_argv_not_shell(
    tmp_path: Path,
) -> None:
    capture = tmp_path / "args.json"
    agy = tmp_path / "agy"
    agy.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "if sys.argv[1:] == ['models']:\n"
        "    print(json.dumps({'models': [{'id': 'machine-model-id', 'tiers': ['scout']}]}))\n"
        "    raise SystemExit(0)\n"
        "open(os.environ['AGY_CAPTURE'], 'w').write(json.dumps(sys.argv[1:]))\n",
        encoding="utf-8",
    )
    agy.chmod(0o755)
    capabilities = tmp_path / "capabilities.json"
    capabilities.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "source": "provider-cli-runtime",
                "models": [
                    {"id": "machine-model-id", "tiers": ["scout"], "verified": True}
                ],
            }
        ),
        encoding="utf-8",
    )
    marker = tmp_path / "must-not-exist"
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        requirements=f"Inventory only; $(touch {marker})",
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    manifest = write_manifest(
        tmp_path,
        request,
        {"cli": "agy", "executable": str(agy), "capabilities_file": str(capabilities)},
    )
    result = run_runner(
        manifest,
        "--execute",
        "--allow-external-code-sharing",
        env={"AGY_CAPTURE": str(capture)},
    )
    assert result.returncode == 0, result.stderr
    args = json.loads(capture.read_text(encoding="utf-8"))
    assert args[:3] == ["--sandbox", "--mode", "plan"]
    assert args[3:5] == ["--model", "machine-model-id"]
    assert "--print" in args
    assert "accept-edits" not in args
    assert "--dangerously-skip-permissions" not in args
    assert not marker.exists()


def test_forged_manifest_capability_cannot_authorize_model_flag(tmp_path: Path) -> None:
    capture = tmp_path / "args.json"
    agy = tmp_path / "agy"
    agy.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "if sys.argv[1:] == ['models']:\n"
        "    print('Human Display Name Only')\n"
        "    raise SystemExit(0)\n"
        "open(os.environ['AGY_CAPTURE'], 'w').write(json.dumps(sys.argv[1:]))\n",
        encoding="utf-8",
    )
    agy.chmod(0o755)
    forged = tmp_path / "forged.json"
    forged.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "source": "provider-cli-runtime",
                "models": [
                    {"id": "attacker-model", "tiers": ["scout"], "verified": True}
                ],
            }
        ),
        encoding="utf-8",
    )
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    result = run_runner(
        write_manifest(
            tmp_path,
            request,
            {"cli": "agy", "executable": str(agy), "capabilities_file": str(forged)},
        ),
        "--execute",
        "--allow-external-code-sharing",
        env={"AGY_CAPTURE": str(capture)},
    )
    assert result.returncode == 0, result.stderr
    args = json.loads(capture.read_text(encoding="utf-8"))
    assert "--model" not in args
    assert "attacker-model" not in args


@pytest.mark.parametrize(
    "request_override",
    [
        {"access": "write"},
        {"write": True},
        {"requires_write": True},
        {
            "scopes": [
                {
                    "id": "inventory",
                    "paths": ["src"],
                    "independent": True,
                    "risk_signals": [],
                    "access": "write",
                }
            ]
        },
    ],
)
def test_runner_fails_closed_when_manifest_requests_write(
    tmp_path: Path, request_override: dict[str, object]
) -> None:
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    request.update(request_override)
    result = run_runner(
        write_manifest(tmp_path, request),
        "--execute",
        "--allow-external-code-sharing",
    )
    assert result.returncode != 0
    assert "read-only" in result.stderr.lower()


def test_runner_rejects_provider_edit_or_dangerous_flags(tmp_path: Path) -> None:
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    for flags in (["--mode", "accept-edits"], ["--dangerously-skip-permissions"]):
        result = run_runner(
            write_manifest(tmp_path, request, {"cli": "agy", "args": flags})
        )
        assert result.returncode != 0
        assert "provider args" in result.stderr.lower()
    for override in ({"mode": "accept-edits"}, {"dangerously_skip_permissions": True}):
        result = run_runner(
            write_manifest(tmp_path, request, {"cli": "agy", **override})
        )
        assert result.returncode != 0
        assert "provider" in result.stderr.lower()


def test_runner_anchors_cwd_to_manifest_workspace_from_another_cwd(
    tmp_path: Path,
) -> None:
    manifest_dir = tmp_path / "manifest-dir"
    manifest_dir.mkdir()
    other_cwd = tmp_path / "other-cwd"
    other_cwd.mkdir()
    capture = tmp_path / "cwd.txt"
    agy = tmp_path / "agy"
    agy.write_text(
        "#!/usr/bin/env python3\n"
        "import os\n"
        "open(os.environ['AGY_CAPTURE'], 'w').write(os.getcwd() + '\\n' + os.environ.get('FORGEWRIGHT_WORKSPACE', ''))\n",
        encoding="utf-8",
    )
    agy.chmod(0o755)
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    manifest = write_manifest(
        manifest_dir, request, {"cli": "agy", "executable": str(agy)}
    )
    result = run_runner(
        manifest,
        "--execute",
        "--allow-external-code-sharing",
        env={"AGY_CAPTURE": str(capture)},
        cwd=other_cwd,
    )
    assert result.returncode == 0, result.stderr
    plan = json.loads(result.stdout)
    assert plan["workspace"] == str(manifest_dir.resolve())
    assert capture.read_text(encoding="utf-8").splitlines() == [
        str(manifest_dir.resolve()),
        str(manifest_dir.resolve()),
    ]


def test_runner_fails_closed_without_runtime_loaded_global_hook(tmp_path: Path) -> None:
    home = tmp_path / "home-without-hook"
    home.mkdir()
    agy = tmp_path / "agy"
    agy.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    agy.chmod(0o755)
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    result = run_runner(
        write_manifest(tmp_path, request, {"cli": "agy", "executable": str(agy)}),
        "--execute",
        "--allow-external-code-sharing",
        env={"HOME": str(home)},
    )
    assert result.returncode != 0
    assert "antigravity" in result.stderr.lower() and "hook" in result.stderr.lower()


def test_runner_rejects_global_hook_command_wrapper(tmp_path: Path) -> None:
    home = tmp_path / "home"
    gate = home / ".forgewright" / "scripts" / "lite" / "antigravity-pre-tool-gate.sh"
    gate.parent.mkdir(parents=True)
    gate.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    hooks = home / ".gemini" / "config" / "hooks.json"
    hooks.parent.mkdir(parents=True)
    hooks.write_text(
        json.dumps(
            {
                "forgewright-policy": {
                    "PreToolUse": [
                        {
                            "matcher": "*",
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": f"true || bash {gate}",
                                }
                            ],
                        }
                    ]
                }
            }
        ),
        encoding="utf-8",
    )
    agy = tmp_path / "agy"
    agy.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    agy.chmod(0o755)
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    result = run_runner(
        write_manifest(tmp_path, request, {"cli": "agy", "executable": str(agy)}),
        "--execute",
        "--allow-external-code-sharing",
        env={"HOME": str(home)},
    )
    assert result.returncode != 0
    assert "invalid global antigravity" in result.stderr.lower()


def test_runner_rejects_workspace_symlink_escape(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    outside = tmp_path / "outside"
    workspace.mkdir()
    outside.mkdir()
    (workspace / "src").symlink_to(outside, target_is_directory=True)
    request = base_request(
        workspace=str(workspace),
        task_size="medium",
        mechanical_inventory=True,
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
    )
    result = run_runner(write_manifest(tmp_path, request))
    assert result.returncode != 0
    assert "workspace" in result.stderr.lower() and "escape" in result.stderr.lower()


def _reviewer_fixture(tmp_path: Path, *, reviewer_exit: int = 0) -> tuple[Path, Path]:
    capture = tmp_path / "calls.jsonl"
    agy = tmp_path / "agy"
    agy.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "if sys.argv[1:] == ['models']:\n"
        "    print('Human Display Names Only')\n"
        "    raise SystemExit(0)\n"
        "prompt = sys.argv[-1]\n"
        "with open(os.environ['AGY_CAPTURE'], 'a') as f:\n"
        "    f.write(json.dumps({'argv': sys.argv[1:], 'cwd': os.getcwd()}) + '\\n')\n"
        "print('token=super-secret WORKER_REASONING_PRIVATE ' + ('X' * 500))\n"
        "print('password: hidden-value ' + ('Y' * 500), file=sys.stderr)\n"
        f"sys.exit({reviewer_exit} if '[Forgewright independent reviewer]' in prompt else 0)\n",
        encoding="utf-8",
    )
    agy.chmod(0o755)
    request = base_request(
        task_size="medium",
        mechanical_inventory=True,
        independent_review=True,
        requirements="IMMUTABLE_REQUIREMENTS",
        diff="IMMUTABLE_DIFF",
        raw_evidence=["IMMUTABLE_RAW_EVIDENCE"],
        scopes=[
            {
                "id": "inventory",
                "paths": ["src"],
                "independent": True,
                "risk_signals": [],
            }
        ],
        limits={
            "concurrency": 2,
            "remaining_token_budget": 4_000,
            "worker_token_budget": 2_000,
            "deadline_ms": 30_000,
            "max_result_chars": 120,
        },
    )
    manifest = write_manifest(tmp_path, request, {"cli": "agy", "executable": str(agy)})
    return manifest, capture


def test_results_are_bounded_redacted_and_reviewer_executes_with_isolated_prompt(
    tmp_path: Path,
) -> None:
    manifest, capture = _reviewer_fixture(tmp_path)
    result = run_runner(
        manifest,
        "--execute",
        "--allow-external-code-sharing",
        env={"AGY_CAPTURE": str(capture)},
    )
    assert result.returncode == 0, result.stderr
    plan = json.loads(result.stdout)
    worker_result = plan["execution"]["results"][0]
    reviewer_result = plan["execution"]["reviewer_result"]
    for record in (worker_result, reviewer_result):
        assert len(record["stdout"]) <= 120
        assert len(record["stderr"]) <= 120
        assert "super-secret" not in record["stdout"]
        assert "hidden-value" not in record["stderr"]
        assert "***REDACTED***" in record["stdout"] + record["stderr"]

    calls = [
        json.loads(line) for line in capture.read_text(encoding="utf-8").splitlines()
    ]
    assert len(calls) == 2
    assert all(call["argv"][:3] == ["--sandbox", "--mode", "plan"] for call in calls)
    assert all("accept-edits" not in call["argv"] for call in calls)
    assert all("--dangerously-skip-permissions" not in call["argv"] for call in calls)
    worker_prompt = calls[0]["argv"][-1]
    reviewer_prompt = calls[1]["argv"][-1]
    assert "[Forgewright independent reviewer]" not in worker_prompt
    assert "[Forgewright independent reviewer]" in reviewer_prompt
    assert "IMMUTABLE_REQUIREMENTS" in reviewer_prompt
    assert "IMMUTABLE_DIFF" in reviewer_prompt
    assert "IMMUTABLE_RAW_EVIDENCE" in reviewer_prompt
    assert "WORKER_REASONING_PRIVATE" not in reviewer_prompt
    assert "worker-1" not in reviewer_prompt
    assert "Do not spawn subagents" in reviewer_prompt


def test_reviewer_failure_fails_the_plan(tmp_path: Path) -> None:
    manifest, capture = _reviewer_fixture(tmp_path, reviewer_exit=7)
    result = run_runner(
        manifest,
        "--execute",
        "--allow-external-code-sharing",
        env={"AGY_CAPTURE": str(capture)},
    )
    assert result.returncode != 0
    plan = json.loads(result.stdout)
    assert plan["execution"]["status"] == "failed"
    assert plan["execution"]["reviewer_result"]["exit_code"] == 7
