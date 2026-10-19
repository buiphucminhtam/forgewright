"""Native project opt-in is scoped data, never a new acceptance authority."""
import json
from pathlib import Path
import sys
import types

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))


def config(root, *, digest="a" * 64):
    folder = root / ".forgewright"; folder.mkdir()
    path = folder / "recurrence.json"
    value = {"schema": "forgewright-recurrence-optin/v1", "diagnostics": True,
             "profiles": {"check-v1": {"digest": digest, "operation": "typecheck",
                 "platform": sys.platform, "toolchain": {"recipe_digest": digest}}},
             "captures": []}
    path.write_text(json.dumps(value)); path.chmod(0o600)
    return path, value


def test_absent_optin_is_readonly_and_nonblocking(tmp_path):
    from recurrence_adapter import before_profile, after_profile
    assert before_profile(tmp_path, {"id": "check-v1"}, "a"*64, "session") == ""
    assert after_profile(tmp_path, {"id":"check-v1"}, "a"*64, {})["status"] == "disabled"
    assert list(tmp_path.iterdir()) == []


def test_only_matching_profile_can_retrieve_bounded_context(tmp_path, monkeypatch):
    from recurrence_adapter import before_profile
    config(tmp_path); calls=[]
    def context(*args):
        calls.append(args); return {"status":"retrieved", "context":"Applicable untrusted lesson"}
    monkeypatch.setitem(sys.modules, "recurrence", types.SimpleNamespace(lesson_context=context))
    assert before_profile(tmp_path, {"id":"check-v1"}, "b"*64, "s") == ""
    assert calls == []
    assert before_profile(tmp_path, {"id":"check-v1"}, "a"*64, "s") == "Applicable untrusted lesson"
    assert calls[0][1:] == ("typecheck", sys.platform, {"recipe_digest":"a"*64}, "s")


def test_terminal_projection_has_native_event_identity_and_no_output(tmp_path, monkeypatch):
    from recurrence_adapter import after_profile
    config(tmp_path); calls=[]
    monkeypatch.setitem(sys.modules, "recurrence", types.SimpleNamespace(
        record_native_diagnostic=lambda *args: calls.append(args) or {"status":"recorded"}))
    receipt={"job_id":"job-"+"1"*32,"state":"quiescent","exit_code":0,
             "native_context":{"native":{"session_id":"native-session"}},"output":"PRIVATE"}
    result=after_profile(tmp_path, {"id":"check-v1"}, "a"*64, receipt)
    assert result["diagnostic"]["status"] == "recorded"
    event=calls[0][1]
    assert event["session_id"] == "native-session" and event["outcome"] == "success"
    assert "PRIVATE" not in json.dumps(event) and "output" not in event
    assert event["event_id"] == receipt["job_id"]


def test_invalid_or_symlink_optin_does_not_change_execution_result(tmp_path):
    from recurrence_adapter import before_profile, after_profile
    path,value=config(tmp_path); outside=tmp_path/'private.json';outside.write_text(json.dumps(value))
    path.unlink();path.symlink_to(outside)
    assert before_profile(tmp_path,{"id":"check-v1"},"a"*64,"s") == ""
    assert after_profile(tmp_path,{"id":"check-v1"},"a"*64,{"state":"quarantined"})["status"] == "unavailable"
    assert outside.read_text() == json.dumps(value)


@pytest.mark.parametrize('callback',[None,[],RuntimeError('optional failure'),AttributeError('shape')])
def test_optional_callback_cannot_break_job_or_hook(tmp_path,monkeypatch,callback):
    from recurrence_adapter import before_profile,after_profile
    config(tmp_path)
    def broken(*args):
        if isinstance(callback,Exception):raise callback
        return callback
    monkeypatch.setitem(sys.modules,'recurrence',types.SimpleNamespace(lesson_context=broken,record_native_diagnostic=broken))
    assert before_profile(tmp_path,{'id':'check-v1'},'a'*64,'s') == ''
    for code in (0,7):
        receipt={'state':'quiescent','exit_code':code,'job_id':'job-'+'1'*32,'native_context':None}
        assert after_profile(tmp_path,{'id':'check-v1'},'a'*64,receipt)['status'] in {'processed','unavailable'}
        assert receipt['exit_code']==code


@pytest.mark.parametrize('bad',[None,{'bad':object()},{'bad':float('nan')},{'text':'x'*17000}])
def test_host_boundary_preserves_original_terminal_result(tmp_path,monkeypatch,bad):
    from host_jobs import recurrence_projection
    def callback(*args):
        args[-1]['exit_code']=99
        return bad
    monkeypatch.setitem(sys.modules,'recurrence_adapter',types.SimpleNamespace(after_profile=callback))
    for code in (0,7):
        receipt={'job_id':'job-'+'1'*32,'state':'quiescent','exit_code':code}
        result=recurrence_projection(tmp_path,{'id':'check-v1'},'a'*64,receipt)
        assert result=={'status':'unavailable','authority':'context-only','promoted':False}
        assert receipt['exit_code']==code


def test_host_boundary_contains_unavailable_optional_import(tmp_path,monkeypatch):
    from host_jobs import recurrence_projection
    monkeypatch.setitem(sys.modules,'recurrence_adapter',None)
    for code in (0,7):
        receipt={'state':'quiescent','exit_code':code}
        assert recurrence_projection(tmp_path,{},'a'*64,receipt)['status']=='unavailable'
        assert receipt['exit_code']==code


def test_runtime_selected_captures_are_bounded_and_revalidated(tmp_path,monkeypatch):
    from recurrence_adapter import after_profile
    config(tmp_path); calls=[]
    candidate={'profile':'check-v1','session':'s','event':'e','evidence_ref':'.forgewright/verify/final.json',
               'job_id':'job-'+'2'*32,'payload':{'summary':'selected'}}
    path=tmp_path/'.forgewright/runtime/memory/recurrence/selected.json'
    path.parent.mkdir(parents=True)
    def write(items):
        path.write_text(json.dumps({'schema':'forgewright-recurrence-selected/v1','captures':items}));path.chmod(0o600)
    monkeypatch.setitem(sys.modules,'recurrence',types.SimpleNamespace(
        record_native_diagnostic=lambda *args:{'status':'recorded'},
        capture_verified_lesson=lambda *args:calls.append(args) or {'status':'rejected','reason':'unverified'}))
    receipt={'state':'quiescent','exit_code':0,'job_id':'job-'+'1'*32}
    write([candidate])
    result=after_profile(tmp_path,{'id':'check-v1'},'a'*64,receipt)
    assert result['captures']==[{'status':'rejected','reason':'unverified'}]
    assert calls[0][1:]==(candidate['payload'],'s','e',candidate['evidence_ref'],candidate['job_id'])
    calls.clear();write([candidate]*4)
    assert after_profile(tmp_path,{'id':'check-v1'},'a'*64,receipt)['status']=='unavailable'
    assert not calls
    path.unlink();outside=tmp_path/'selected.json';outside.write_text('{}');path.symlink_to(outside)
    assert after_profile(tmp_path,{'id':'check-v1'},'a'*64,receipt)['status']=='unavailable'
    assert outside.read_text()=='{}'
