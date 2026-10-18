"""Bounded fake Codex protocol only; no live model or promotion evidence."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))


def adapter():
    assert (ROOT / "scripts/runtime/skill_eval_app_server.py").is_file(), (
        "native app-server adapter is not implemented"
    )
    import skill_eval_app_server

    return skill_eval_app_server


FAKE = r"""
import json,sys,time,subprocess,os
mode=sys.argv[1];log=sys.argv[2]
args=sys.argv[3:]
def emit(value):print(json.dumps(value),flush=True)
if mode=='stderr_flood':
 import signal
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 open(log+'.pid','w').write(str(child.pid))
 while True:sys.stderr.write('x'*65536);sys.stderr.flush()
if mode=='aggregate_limit':
 sys.stderr.write('x'*3000);sys.stderr.flush()
if '--version' in args:
 print('codex-cli 0.159.0-alpha.3' if mode!='bad_version' else 'codex-cli 99.0')
elif 'features' in args:
 for i,arg in enumerate(args[:-1]):
  if arg=='--disable': print(args[i+1]+' stable '+('true' if mode=='feature_on' and args[i+1]=='shell_tool' else 'false'))
elif 'models' in args:
 emit({'models':[{'slug':'gpt-5.6-sol','experimental_supported_tools':['clock'] if mode=='catalog_tool' else [],'shell_type':'unified_exec','apply_patch_tool_type':'freeform','use_responses_lite':True,'supports_search_tool':True}]})
else:
 thread='native-thread-'+os.path.basename(log);turn='native-turn-'+os.path.basename(log)
 for line in sys.stdin:
  request=json.loads(line)
  with open(log,'a') as f:f.write(json.dumps(request)+'\n')
  method=request.get('method');id=request.get('id')
  if method=='initialize':emit({'id':id,'result':{'userAgent':'fake','platformFamily':'unix','platformOs':'linux','codexHome':'unread'}})
  elif method=='initialized':continue
  elif method=='config/read':
   if mode.startswith('remote_'):
    # Sanitized exact smoke-native-1 prefix shape; identity/timestamp replaced.
    notice={'emittedAtMs':0,'method':'remoteControl/status/changed','params':{'environmentId':None,'installationId':'fixture-installation','serverName':'fixture-server','status':'disabled'}}
    if mode=='remote_connected':notice['params']['status']='connected'
    if mode=='remote_environment':notice['params']['environmentId']='foreign-environment'
    if mode=='remote_extra_thread':notice['params']['threadId']='foreign-thread'
    if mode=='remote_request':notice['id']='forbidden-request'
    if mode=='remote_bad_type':notice['params']['installationId']=1
    if mode=='remote_missing_field':del notice['params']['serverName']
    if mode=='remote_unknown':notice['method']='remoteControl/unknown'
    emit(notice)
   config={'instructions':'PRIVATE_BASE_SENTINEL' if mode=='custom_base' else None,'model_instructions_file':'/private/custom-base.md' if mode=='custom_file' else None,'developer_instructions':None,'model_catalog_json':None,'include_permissions_instructions':mode!='no_permissions','model_providers':{'secret':{'experimental_bearer_token':'NEVER_PERSIST_AUTH_SENTINEL'}}}
   config.update({'compact_prompt':'UNBOUND_COMPACT_SENTINEL' if mode=='custom_compact' else None,'experimental_compact_prompt_file':'/private/compact.md' if mode=='custom_compact_file' else None,'model_reasoning_summary':None,'model_verbosity':'high' if mode=='verbosity_drift' else 'low','personality':'pragmatic','service_tier':None,'include_environment_context':mode!='context_drift','include_collaboration_mode_instructions':True,'include_apps_instructions':True,'model_context_window':None,'model_auto_compact_token_limit':None,'model_auto_compact_token_limit_scope':None,'model_post_turn_compact_threshold_percent':None})
   if mode=='invalid_context_type':config['model_context_window']=True
   if mode=='invalid_context_enum':config['model_verbosity']='loud'
   if mode=='partial_config':config={'include_permissions_instructions':True}
   response={'id':id,'result':{'config':config,'origins':{},'layers':None}}
   if mode=='config_error':response['error']={'code':-1,'message':'not-success'}
   emit(response)
  elif method=='model/list':emit({'id':id,'result':{'data':[{'id':'gpt-5.6-sol','model':'gpt-5.6-sol','supportedReasoningEfforts':[{'reasoningEffort':'low'}]}],'nextCursor':None}})
  elif method=='thread/start':
   p=request['params']
   emit({'method':'thread/started','params':{'thread':{'id':thread}}})
   emit({'id':id,'result':{'thread':{'id':thread,'ephemeral':True,'environments':[] if mode!='environment' else [{'environmentId':'foreign'}]},'cwd':p['cwd'],'model':'wrong' if mode=='model' else 'gpt-5.6-sol','modelProvider':'openai','reasoningEffort':'low','instructionSources':['/foreign/AGENTS.md'] if mode=='source' else [],'runtimeWorkspaceRoots':[],'sandbox':{'type':'readOnly','networkAccess':False},'approvalPolicy':'never'}})
  elif method=='mcpServerStatus/list':
   if request.get('params',{}).get('threadId')!=thread:
    emit({'id':id,'error':{'code':-1,'message':'missing thread binding'}});continue
   if mode=='ui_request':emit({'id':'request-ui','method':'item/tool/requestUserInput','params':{'question':'never forward'}})
   if mode=='warning':emit({'method':'warning','params':{'message':'unapplied config'}})
   emit({'id':id,'result':{'data':[{'name':'foreign','tools':{'read':{}}}] if mode=='mcp' else [],'nextCursor':None}})
  elif method=='turn/start':
   if mode!='response_late':emit({'id':id,'result':{'turn':{'id':turn,'items':[],'status':'inProgress'}}})
   emit({'method':'thread/status/changed','params':{'threadId':thread,'status':{'type':'active','activeFlags':[]}}})
   emit({'method':'turn/started','params':{'threadId':thread,'turn':{'id':turn,'items':[],'status':'inProgress'}}})
   if mode=='response_late':emit({'id':id,'result':{'turn':{'id':turn,'items':[],'status':'inProgress'}}})
   user={'id':'u','type':'userMessage','content':request['params']['input']}
   emit({'method':'item/completed','params':{'threadId':thread,'turnId':turn,'item':user}})
   if mode=='timeout':
    child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'])
    open(log+'.pid','w').write(str(child.pid));time.sleep(30)
   if mode=='reroute':emit({'method':'model/rerouted','params':{'threadId':thread,'turnId':turn,'fromModel':'gpt-5.6-sol','toModel':'fallback','reason':'other'}})
   if mode=='tool':emit({'method':'item/started','params':{'threadId':thread,'turnId':turn,'item':{'id':'tool','type':'commandExecution','command':'no'}}})
   if mode=='reasoning':emit({'method':'item/completed','params':{'threadId':thread,'turnId':turn,'item':{'id':'r','type':'reasoning','summary':['PRIVATE_REASONING_SENTINEL'],'content':['PRIVATE_REASONING_SENTINEL']}}})
   answer={'id':'answer','type':'agentMessage','text':'{"configured_model":"model-content-is-not-host-proof"}' if mode=='spoof' else 'retention=0.20','phase':'final'}
   emit({'method':'item/completed','params':{'threadId':'foreign' if mode=='thread' else thread,'turnId':turn,'item':answer}})
   if mode!='usage':
    u={'inputTokens':5,'cachedInputTokens':0,'outputTokens':2,'reasoningOutputTokens':0,'totalTokens':7}
    emit({'method':'thread/tokenUsage/updated','params':{'threadId':thread,'turnId':turn,'tokenUsage':{'last':u,'total':u,'modelContextWindow':None}}})
   if mode!='terminal':
    emit({'method':'turn/completed','params':{'threadId':thread,'turn':{'id':turn,'items':[user,answer],'status':'completed'}}})
    emit({'method':'thread/status/changed','params':{'threadId':thread,'status':{'type':'idle'}}})
    if mode=='late_tool':emit({'method':'item/started','params':{'threadId':thread,'turnId':turn,'item':{'id':'late','type':'commandExecution'}}})
   if mode=='terminal':break
"""


def fixture(tmp_path, mode="valid", payload=None, output_bytes=4 * 1024 * 1024):
    tmp_path.mkdir(parents=True, exist_ok=True)
    a = adapter()
    import skill_eval_host as host

    fake = tmp_path / "fake.py"
    fake.write_text(FAKE)
    cwd = tmp_path / "isolated"
    cwd.mkdir()
    packet = payload or {
        "prompt": "Calculate retention.",
        "source_facts": {"retained": 20, "cohort": 100},
        "sources": [
            {
                "path": "/frozen/skill.md",
                "sha256": "a" * 64,
                "kind": "instruction",
                "arm": "current",
                "text": "Use formula $p$; do not activate host skills.",
            }
        ],
    }
    limits = host.HostLimits(
        wall_seconds=3, cleanup_seconds=2, output_bytes=output_bytes
    )
    result = a.capture_transport(
        "codex",
        json.dumps(packet).encode(),
        model="gpt-5.6-sol",
        effort="low",
        cwd=cwd,
        limits=limits,
        fixture_command=(sys.executable, str(fake), mode, str(tmp_path / "requests")),
    )
    requests = (
        [json.loads(line) for line in (tmp_path / "requests").read_text().splitlines()]
        if (tmp_path / "requests").exists()
        else []
    )
    return result, requests


def test_native_fake_session_binds_selection_one_turn_and_inline_sources(tmp_path):
    result, requests = fixture(tmp_path)
    evidence = result["evidence"]
    assert evidence["failures"] == []
    assert evidence["model"]["configured"] == "gpt-5.6-sol"
    assert evidence["model"]["reported"] is None
    assert evidence["model"]["identity_basis"] == "service-configured-no-reroute"
    assert evidence["usage"]["scope"] == "single-native-turn"
    assert evidence["tool_calls"] == 0
    assert evidence["output"] == ["retention=0.20"]
    assert result["process"]["cleanup"]["complete"]
    assert sum(r.get("method") == "turn/start" for r in requests) == 1
    start = next(r for r in requests if r.get("method") == "thread/start")
    assert "$p$" in start["params"]["developerInstructions"]
    turn = next(r for r in requests if r.get("method") == "turn/start")
    assert "$" not in json.dumps(turn["params"]["input"])
    assert "oracle" not in start["params"]["developerInstructions"]


@pytest.mark.parametrize(
    "mode",
    [
        "bad_version",
        "feature_on",
        "catalog_tool",
        "model",
        "source",
        "environment",
        "mcp",
        "warning",
        "ui_request",
        "custom_base",
        "custom_file",
        "no_permissions",
        "partial_config",
        "config_error",
        "custom_compact",
        "custom_compact_file",
        "invalid_context_type",
        "invalid_context_enum",
    ],
)
def test_native_rejects_unproved_controls_before_any_generation_request(tmp_path, mode):
    result, requests = fixture(tmp_path, mode)
    assert result["evidence"]["failures"]
    assert not any(r.get("method") == "turn/start" for r in requests)
    assert not any("method" not in r and r.get("id") == "request-ui" for r in requests)
    assert result["process"]["cleanup"]["complete"]


@pytest.mark.parametrize(
    "mode", ["terminal", "usage", "thread", "tool", "reroute", "late_tool"]
)
def test_native_rejects_incomplete_or_foreign_or_forbidden_turn(tmp_path, mode):
    result, requests = fixture(tmp_path, mode)
    assert result["evidence"]["failures"]
    assert sum(r.get("method") == "turn/start" for r in requests) == 1
    assert result["process"]["cleanup"]["complete"]


def test_native_reasoning_bodies_are_never_persisted(tmp_path):
    result, _ = fixture(tmp_path, "reasoning")
    assert result["evidence"]["failures"] == []
    assert b"PRIVATE_REASONING_SENTINEL" not in result["process"]["stdout"]
    assert b"PRIVATE_REASONING_SENTINEL" not in result["process"]["stderr"]
    assert b"body_sha256" in result["process"]["stdout"]


def test_native_model_text_cannot_issue_configured_selection(tmp_path):
    result, _ = fixture(tmp_path, "spoof")
    assert result["evidence"]["model"]["configured"] == "gpt-5.6-sol"
    assert result["evidence"]["model"]["reported"] is None
    assert "model-content-is-not-host-proof" in result["evidence"]["output"][0]


def test_native_skill_mention_in_public_task_is_refused_before_launch(tmp_path):
    with pytest.raises(ValueError, match="mention"):
        fixture(
            tmp_path,
            payload={"prompt": "Use $foreign-skill", "source_facts": {}, "sources": []},
        )


def test_native_timeout_reaps_nested_owned_processes_and_preserves_foreign(tmp_path):
    foreign = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"])
    try:
        result, _ = fixture(tmp_path, "timeout")
        assert result["process"]["failure"] == "timeout"
        assert result["process"]["cleanup"]["complete"]
        assert not Path("/proc/" + (tmp_path / "requests.pid").read_text()).exists()
        assert foreign.poll() is None
    finally:
        foreign.terminate()
        foreign.wait()


def test_native_host_dispatch_keeps_configured_identity_distinct_and_fixtures_ineligible(
    tmp_path,
):
    import skill_eval_host as host

    fake = tmp_path / "fake.py"
    fake.write_text(FAKE)
    request = host.HostRequest(
        "case",
        "current",
        1,
        {
            "prompt": "Calculate retention.",
            "source_facts": {"retained": 20, "cohort": 100},
        },
        (),
        "a" * 64,
        "gpt-5.6-sol",
        "low",
        runtime="codex-app-server",
        fixture_command=(
            sys.executable,
            str(fake),
            "valid",
            str(tmp_path / "requests"),
        ),
    )
    run = host.capture_run(
        request, output_dir=tmp_path / "run", limits=host.HostLimits(wall_seconds=3)
    )
    assert run.success
    assert not run.promotion_eligible
    assert run.record["model"]["reported"] is None
    assert run.record["model"]["configured"] == "gpt-5.6-sol"
    assert run.record["native_control_digest"]
    assert host.verify_issued_run(run)
    names = {Path(p).name for p in run.record["runtime_sources"]}
    assert names == {
        "skill_eval_host.py",
        "skill_eval_process.py",
        "skill_eval_app_server.py",
    }
    assert (run.output_dir / "runtime-sources.json").is_file()


def test_native_combined_pipe_budget_spans_all_preflight_processes(tmp_path):
    result, requests = fixture(tmp_path, "aggregate_limit", output_bytes=9000)
    assert "native_output_limit" in result["evidence"]["failures"]
    assert result["evidence"]["native_observed_bytes"] > 9000
    assert not any(r.get("method") == "turn/start" for r in requests)
    assert result["process"]["cleanup"]["complete"]


def test_native_effective_config_is_projected_before_any_evidence_emission(tmp_path):
    result, _ = fixture(tmp_path)
    assert result["evidence"]["failures"] == []
    assert b"NEVER_PERSIST_AUTH_SENTINEL" not in result["process"]["stdout"]
    assert b"NEVER_PERSIST_AUTH_SENTINEL" not in result["process"]["stderr"]
    projection = result["evidence"]["native_controls"]["effective_instruction_config"]
    assert projection["instructions_present"] is False
    assert projection["model_instructions_file_present"] is False
    assert projection["include_permissions_instructions"] is True
    result2, _ = fixture(tmp_path / "custom", "custom_base")
    assert result2["evidence"]["failures"]
    assert b"PRIVATE_BASE_SENTINEL" not in result2["process"]["stdout"]


def test_empty_fixture_argv_cannot_bypass_native_binary_pin(tmp_path, monkeypatch):
    import skill_eval_host as host

    def forbidden(*args, **kwargs):
        pytest.fail("invalid fixture argv must fail before launch")

    monkeypatch.setattr(host, "run_owned_process", forbidden)
    limits = host.HostLimits()
    with pytest.raises(ValueError, match="fixture"):
        adapter().capture_transport(
            "untrusted",
            b'{"prompt":"test","source_facts":{}}',
            model="gpt-5.6-sol",
            effort="low",
            cwd=tmp_path,
            limits=limits,
            fixture_command=(),
        )
    request = host.HostRequest(
        "case",
        "current",
        1,
        {"prompt": "test"},
        (),
        "a" * 64,
        "gpt-5.6-sol",
        "low",
        runtime="codex-app-server",
        fixture_command=(),
    )
    with pytest.raises(ValueError, match="fixture"):
        host.capture_run(request, output_dir=tmp_path / "not-created", limits=limits)
    assert not (tmp_path / "not-created").exists()


def test_stderr_overflow_kills_term_ignoring_child_before_wall_timeout(tmp_path):
    result, requests = fixture(tmp_path, "stderr_flood", output_bytes=9000)
    assert "native_output_limit" in result["evidence"]["failures"]
    assert result["process"]["failure"] is None
    assert result["process"]["elapsed_ms"] < 3000
    assert result["process"]["cleanup"]["complete"]
    assert not Path("/proc/" + (tmp_path / "requests.pid").read_text()).exists()
    assert not requests


def test_notifications_can_precede_matching_turn_start_response(tmp_path):
    result, requests = fixture(tmp_path, "response_late")
    assert result["evidence"]["failures"] == []
    assert result["evidence"]["terminal"]
    assert result["evidence"]["turn_id"].startswith("native-turn-")
    assert sum(r.get("method") == "turn/start" for r in requests) == 1


@pytest.mark.parametrize(
    "candidate_mode", ["valid", "verbosity_drift", "context_drift"]
)
def test_real_native_fixture_registry_binds_context_and_accepts_distinct_ids(
    tmp_path, candidate_mode
):
    import hashlib
    import importlib.util
    import skill_eval_host as host
    import skill_eval_verify as verify
    import skill_quality as quality

    spec = importlib.util.spec_from_file_location(
        "native_verify_fixtures", Path(__file__).with_name("test_skill_eval_verify.py")
    )
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    cases, current, candidate, dep, facts, oracle = helpers.setup(tmp_path)
    fake = tmp_path / "fake.py"
    fake.write_text(FAKE)
    runs = []
    for arm in quality.VARIANTS:
        instruction = (
            None if arm == "baseline" else current if arm == "current" else candidate
        )
        sources = (
            ()
            if instruction is None
            else (
                {
                    "path": str(instruction),
                    "sha256": hashlib.sha256(instruction.read_bytes()).hexdigest(),
                    "kind": "instruction",
                    "arm": arm,
                },
            )
        )
        request = host.HostRequest(
            "case",
            arm,
            1,
            {"prompt": cases[0]["prompt"], "source_facts": facts["case"]},
            sources,
            oracle.digest,
            "gpt-5.6-sol",
            "low",
            runtime="codex-app-server",
            fixture_command=(
                sys.executable,
                str(fake),
                candidate_mode if arm == "candidate" else "valid",
                str(tmp_path / arm),
            ),
        )
        run = host.capture_run(
            request,
            output_dir=tmp_path / ("run-" + arm),
            limits=host.HostLimits(wall_seconds=3),
        )
        assert run.success, run.record["failures"]
        assert host.verify_issued_run(run)
        assert not run.promotion_eligible
        runs.append(run)
    assert len({r.run_id for r in runs}) == 3
    assert len({r.record["thread_id"] for r in runs}) == 3
    assert len({r.record["turn_id"] for r in runs}) == 3
    assert len({r.record["executable"]["cwd"] for r in runs}) == 3
    manifest = verify.freeze_manifest(
        oracle,
        run_manifests={
            (r.record["case_id"], r.record["arm"]): r.manifest_digest for r in runs
        },
        current_skill=current,
        candidate_skill=candidate,
        dependencies=(dep,),
    )
    registry = verify.TrustedRunRegistry(manifest)

    def add_all():
        for run in runs:
            registry.add(run, verify.judge_run(run, case=cases[0], oracle=oracle))

    if candidate_mode == "valid":
        add_all()
        assert registry._valid()
        assert len({r.record["native_control_digest"] for r in runs}) == 1
    else:
        with pytest.raises(ValueError, match="native control/capability drift"):
            add_all()
        assert not registry._valid()


def test_actual_sanitized_disabled_connection_prefix_is_separate_from_thread_lifecycle(
    tmp_path,
):
    result, requests = fixture(tmp_path, "remote_disabled")
    assert result["evidence"]["failures"] == []
    assert result["evidence"]["connection_lifecycle"] == [
        {
            "method": "remoteControl/status/changed",
            "params": {
                "environmentId": None,
                "installationId": "fixture-installation",
                "serverName": "fixture-server",
                "status": "disabled",
            },
            "emittedAtMs": 0,
        }
    ]
    assert sum(r.get("method") == "turn/start" for r in requests) == 1
    assert result["process"]["cleanup"]["complete"]


@pytest.mark.parametrize(
    "mode",
    [
        "remote_connected",
        "remote_environment",
        "remote_extra_thread",
        "remote_request",
        "remote_bad_type",
        "remote_missing_field",
        "remote_unknown",
    ],
)
def test_connection_notification_exception_never_allows_active_unknown_or_action_payloads(
    tmp_path, mode
):
    result, requests = fixture(tmp_path, mode)
    assert result["evidence"]["failures"]
    assert not any(r.get("method") == "turn/start" for r in requests)
    assert result["process"]["cleanup"]["complete"]
