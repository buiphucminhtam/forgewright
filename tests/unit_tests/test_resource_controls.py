"""Operator controls stay usable without granting arbitrary shell execution."""
import hashlib
import json
from pathlib import Path
import shlex
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
sys.path.insert(0, str(ROOT / "scripts/hooks"))
from resource_admission import control_decision, decide


def test_inspection_is_bounded_read_only_and_scope_checked(tmp_path):
    from resource_controls import inspect_workspace, ControlError
    (tmp_path / "source.py").write_text("one\ntwo\nthree\n")
    result = inspect_workspace(tmp_path, {"op": "read", "path": "source.py", "start": 2, "lines": 1})
    assert result["text"] == "two\n" and result["authority"] == "read-only"
    assert result["sha256"] == hashlib.sha256(b"one\ntwo\nthree\n").hexdigest()
    with pytest.raises(ControlError):
        inspect_workspace(tmp_path, {"op": "read", "path": "../outside"})
    (tmp_path / "alias").symlink_to('/etc/hosts')
    with pytest.raises(ControlError):
        inspect_workspace(tmp_path, {"op": "read", "path": "alias"})
    (tmp_path / ".env").write_text("TOKEN=private")
    with pytest.raises(ControlError):
        inspect_workspace(tmp_path, {"op": "read", "path": ".env"})
    with pytest.raises(ControlError):
        inspect_workspace(tmp_path, {"op": "read", "path": "source.py", "lines": 10001})
    assert (tmp_path / "source.py").read_text() == "one\ntwo\nthree\n"


def test_inspection_search_and_directory_have_finite_budgets(tmp_path):
    from resource_controls import inspect_workspace
    (tmp_path / "a.py").write_text("needle\n")
    (tmp_path / "b.txt").write_text("nothing\n")
    result = inspect_workspace(tmp_path, {"op": "search", "path": ".", "query": "needle"})
    assert result["matches"] == [{"path": "a.py", "line": 1, "text": "needle"}]
    assert "a.py" in inspect_workspace(tmp_path, {"op": "list", "path": "."})["entries"]


def test_native_inspection_rewrites_literal_json_and_rejects_shell_extensions(tmp_path):
    command = "forge delegate resources --inspect " + shlex.quote(json.dumps({"op":"read","path":"file;name.py"}))
    payload = {"tool_name":"Bash","cwd":str(tmp_path),"tool_input":{"command":command}}
    result = control_decision(payload, tmp_path / "home")
    assert result["permissionDecision"] == "allow"
    args = shlex.split(result["updatedInput"]["command"])
    assert "inspect" in args and "file;name.py" in args[-1]
    payload["tool_input"]["command"] = command + "; touch /tmp/not-allowed"
    assert control_decision(payload, tmp_path / "home") is None
    assert decide(payload,tmp_path / "home",{str(tmp_path):{"mode":"enforce","profiles":{}}})["permissionDecision"] == "deny"


def test_reviewed_registration_is_exact_project_hash_bound_and_never_executes(tmp_path):
    from resource_controls import register_profile, ControlError
    from resource_enrollment import stage, registry
    from tests.unit_tests.test_resource_admission_hook import fixture
    home, project, profile, expected = fixture(tmp_path)
    config=tmp_path / "config.toml";config.write_text('[features]\nhooks=true\n')
    stage(home,project,config,{profile['id']:expected},'controls')
    profile=dict(profile,id='new-v1',command='finite-new')
    path=project / '.forgewright/recipes/new.json';path.parent.mkdir(parents=True)
    raw=(json.dumps(profile)+'\n').encode();path.write_bytes(raw);path.chmod(0o600)
    result=register_profile(home,project,path,hashlib.sha256(raw).hexdigest())
    assert result['status']=='registered' and result['executed'] is False
    assert registry(home)[str(project)]['profiles']['new-v1']==result['digest']
    assert not (home/'jobs').exists()
    with pytest.raises(ControlError):register_profile(home,project,path,'0'*64)
    outside=tmp_path/'outside.json';outside.write_bytes(raw)
    with pytest.raises(ControlError):register_profile(home,project,outside,hashlib.sha256(raw).hexdigest())


@pytest.mark.parametrize('separator',['\n','\r','\r\n'])
def test_internal_newlines_never_form_a_literal_alias_or_control(tmp_path,separator):
    from resource_admission import literal_argv, explicit_profile
    command='forge delegate exec'+separator+'--profile check-v1 --digest '+'a'*64
    assert literal_argv(command)==[]
    assert explicit_profile(command,{'profiles':{'check-v1':'a'*64}}) is None
    command='forge delegate resources'+separator+'--inspect '+shlex.quote('{"op":"list"}')
    assert control_decision({'tool_name':'Bash','cwd':str(tmp_path),'tool_input':{'command':command}},tmp_path/'home') is None


def test_optional_context_import_does_not_replace_native_admission(tmp_path,monkeypatch):
    from tests.unit_tests.test_resource_admission_hook import fixture
    home,project,profile,expected=fixture(tmp_path)
    monkeypatch.setitem(sys.modules,'recurrence_adapter',None)
    command='forge delegate exec --profile '+profile['id']+' --digest '+expected
    decision=decide({'tool_name':'Bash','cwd':str(project),'tool_input':{'command':command}},home,
                    {str(project):{'mode':'enforce','profiles':{profile['id']:expected}}})
    assert decision['permissionDecision']=='allow' and 'updatedInput' in decision


def test_native_registration_keeps_file_and_digest_separate_argv(tmp_path):
    path='.forgewright/recipes/job with space.json';digest='a'*64
    command='forge delegate resources --register-profile '+shlex.quote(path)+' --sha256 '+digest
    result=control_decision({'tool_name':'Bash','cwd':str(tmp_path),'tool_input':{'command':command}},tmp_path/'home')
    assert result['permissionDecision']=='allow'
    args=shlex.split(result['updatedInput']['command'])
    assert args[-2:]==['--sha256',digest] and path in args


@pytest.mark.parametrize('path',['.ENV','.Env.secret','.FORGEWRIGHT/memory/notes','.Forgewright/runtime/private','.SSH/config'])
def test_inspection_rejects_private_case_aliases(tmp_path,path):
    from resource_controls import inspect_workspace, ControlError
    p=tmp_path/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('private')
    with pytest.raises(ControlError):inspect_workspace(tmp_path,{'op':'read','path':path})


@pytest.mark.parametrize('suffix',[';id','&&id','|id','>file','<file','\nid'])
def test_control_rejects_attached_shell_operators(tmp_path,suffix):
    command='forge delegate resources --inspect '+shlex.quote('{"op":"list"}')+suffix
    assert control_decision({'tool_name':'Bash','cwd':str(tmp_path),'tool_input':{'command':command}},tmp_path/'home') is None


def test_enrolled_exec_accepts_exact_profile_digest_and_rejects_variants(tmp_path):
    from tests.unit_tests.test_resource_admission_hook import fixture
    home,project,profile,expected=fixture(tmp_path)
    registry={str(project):{'mode':'enforce','profiles':{profile['id']:expected}}}
    command='forge delegate exec --profile '+profile['id']+' --digest '+expected
    payload={'tool_name':'Bash','cwd':str(project),'tool_input':{'command':command}}
    allowed=decide(payload,home,registry)
    assert allowed['permissionDecision']=='allow'
    assert '--profile' in shlex.split(allowed['updatedInput']['command'])
    for bad in (command+';id',command.replace(expected,'0'*64),command.replace(profile['id'],'unknown-v1')):
        payload['tool_input']['command']=bad
        assert decide(payload,home,registry)['permissionDecision']=='deny'


def test_explicit_profile_is_not_blocked_by_unrelated_source_drift(tmp_path):
    from tests.unit_tests.test_resource_admission_hook import fixture
    from host_job_profiles import install_profile
    home,project,profile,expected=fixture(tmp_path)
    extra=project/'extra.py';extra.write_text('print("old")')
    stale=dict(profile,id='stale-v1',sources={'extra.py':hashlib.sha256(extra.read_bytes()).hexdigest()})
    stale_digest=install_profile(home,stale);extra.write_text('changed')
    registry={str(project):{'mode':'enforce','profiles':{'stale-v1':stale_digest,profile['id']:expected}}}
    command='forge delegate exec --profile '+profile['id']+' --digest '+expected
    assert decide({'tool_name':'Bash','cwd':str(project),'tool_input':{'command':command}},home,registry)['permissionDecision']=='allow'


def test_native_exec_alias_issues_one_shot_bound_to_literal_invocation(tmp_path,monkeypatch,capsys):
    """Synthetic wire contract; actual host delivery is tested in rollout."""
    from tests.unit_tests.test_resource_admission_hook import fixture
    from resource_enrollment import stage
    import resource_admission as hook
    from io import BytesIO,TextIOWrapper
    home,project,profile,expected=fixture(tmp_path)
    config=tmp_path/'config.toml';config.write_text('[features]\nhooks=true\n')
    stage(home,project,config,{profile['id']:expected},'wire-alias')
    command='forge delegate exec --profile '+profile['id']+' --digest '+expected
    payload={'tool_name':'Bash','cwd':str(project),'tool_input':{'command':command},
             'session_id':'fixture-session','turn_id':'fixture-turn','tool_use_id':'fixture-tool'}
    monkeypatch.setattr(sys,'stdin',TextIOWrapper(BytesIO(json.dumps(payload).encode())))
    assert hook.main(['--home',str(home)])==0
    result=json.loads(capsys.readouterr().out)['hookSpecificOutput']
    argv=shlex.split(result['updatedInput']['command']);identifier=argv[argv.index('--native-request')+1]
    request=json.loads((home/'native-requests'/(identifier+'.json')).read_text())
    assert request['state']=='issued'
    assert request['context']['invocation_sha256']==hashlib.sha256(command.encode()).hexdigest()
    assert request['context']['lesson_context_chars']==0
    assert request['context']['lesson_context_sha256']==hashlib.sha256(b'').hexdigest()
    assert not (home/'jobs').exists()
