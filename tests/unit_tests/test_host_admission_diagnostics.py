"""Distinguish observation delay from an actual denied resource budget."""

from dataclasses import replace
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

import pytest

from tests.unit_tests.test_host_admission import fixture, poll, release, request
from tests.unit_tests.test_host_swap_budget import swap_sample
import host_resources as resources


def test_observation_warmup_never_claims_insufficient_memory_or_grants(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = swap_sample()
    try:
        queued = request(admission, tmp_path / "project", 100, "worker")
        assert queued["state"] == "queued"
        assert queued["reason"] == "observation-warmup"
        status = admission.status()
        assert status["observationReady"] is False
        assert status["observationWaitMs"] == 15000
        assert status["pauseReason"] == "observation-warmup"
        assert status["swapCreditMiB"] == 0
        clock["now"] += 14
        assert poll(admission, "worker", 100)["state"] == "queued"
        assert admission.status()["observationWaitMs"] == 1000
        clock["now"] += 1
        assert poll(admission, "worker", 100)["state"] == "active"
        status = admission.status()
        assert status["observationReady"] is True
        assert status["observationWaitMs"] == 0
        assert status["pauseReason"] == ""
        assert status["immediateMiB"] == 144
        assert status["availableMiB"] == 1056
        release(admission, "worker", 100)
    finally:
        admission.close()


@pytest.mark.parametrize("reset", ["gap", "counter", "clock", "warning"])
def test_observation_recovery_reports_fresh_wait(tmp_path, reset):
    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = swap_sample()
    try:
        admission.status()
        clock["now"] += 16
        assert admission.status()["observationReady"] is True
        if reset == "gap":
            clock["now"] += 31
        elif reset == "clock":
            clock["now"] -= 1
        elif reset == "counter":
            sensor["sample"] = replace(sensor["sample"], swap_total_bytes=0)
        else:
            sensor["sample"] = replace(sensor["sample"], pressure="warning")
        status = admission.status()
        assert status["paused"] is True
        assert status["observationReady"] is False
        assert status["pauseReason"] == "observation-warmup"
        assert status["observationWaitMs"] == 15000
        assert status["swapCreditMiB"] == 0
    finally:
        admission.close()


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"pressure": "critical"}, "memory-pressure"),
        ({"pressure": "unknown"}, "memory-pressure"),
        ({"load_ratio": 1.1}, "host-load"),
        ({"load_ratio": None}, "telemetry-unavailable"),
        ({"swap_total_bytes": None}, "telemetry-unavailable"),
    ],
)
def test_unsafe_or_missing_observations_do_not_promise_a_timed_recovery(
    tmp_path, changes, reason
):
    admission, _, sensor, _ = fixture(tmp_path)
    sensor["sample"] = swap_sample(**changes)
    try:
        queued = request(admission, tmp_path / "project", 100, "worker")
        assert queued["state"] == "queued"
        assert queued["reason"] == reason
        status = admission.status()
        assert status["paused"] is True
        assert status["pauseReason"] == reason
        assert status["observationReady"] is False
        assert status["observationWaitMs"] == 0
        assert status["swapCreditMiB"] == 0
    finally:
        admission.close()


def test_ready_observation_preserves_browser_budget_rejection(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = swap_sample(reclaimable_estimate_bytes=560 * resources.MIB)
    try:
        request(admission, tmp_path / "project", 100, "worker")
        clock["now"] += 16
        assert poll(admission, "worker", 100)["state"] == "active"
        queued = admission.enqueue(
            job_id="browser",
            token="browser-" + "x" * 40,
            project_root=str(tmp_path / "project"),
            run_id="run-100",
            owner_pid=100,
            kind="heavy",
            memory_mib=1024,
            parent_lease_id="worker",
        )
        assert queued["state"] == "queued"
        assert queued["reason"] == "insufficient-memory"
        status = admission.status()
        assert status["observationReady"] is True
        assert status["paused"] is False
        assert status["pauseReason"] == ""
        assert status["availableMiB"] == 1216
        assert status["headroomMiB"] == 512
        assert status["active_heavy"] == 0
        release(admission, "browser", 100)
        release(admission, "worker", 100)
    finally:
        admission.close()


def test_ready_but_low_memory_and_recovery_hold_are_distinct(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    try:
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB, 100 * resources.MIB, "normal", "test-fixture", 0.1
        )
        assert admission.status()["pauseReason"] == "insufficient-memory"
        sensor["sample"] = replace(sensor["sample"], available_bytes=3 * resources.GIB)
        assert admission.status()["pauseReason"] == "recovery-hold"
        assert admission.status()["observationReady"] is True
        clock["now"] += 15
        assert admission.status()["pauseReason"] == ""
    finally:
        admission.close()


@pytest.mark.parametrize("reason", ["observation-warmup", "insufficient-memory"])
def test_real_ipc_timeout_preserves_reason_budget_and_releases_queue(reason):
    root = Path(__file__).resolve().parents[2]
    # Real client/broker transactions with explicitly synthetic telemetry.
    script = r"""
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {acquireHostSlot,getHostAdmissionStatus} from './integrations/pi/host-governor.mjs';
const dir=process.argv[1],reason=process.argv[2],home=join(dir,'admission'),project=join(dir,'project');mkdirSync(project);
const bootstrap="import sys;sys.path.insert(0,sys.argv[1]);import host_admission_broker as b;from host_admission import HostAdmission;from host_resources import MemorySnapshot,GIB,MIB;s=MemorySnapshot(8*GIB,100*MIB,'normal','darwin-vm-stat+memorystatus',0.1,700*MIB,100,100*MIB,1000*MIB) if sys.argv[3]=='observation-warmup' else MemorySnapshot(8*GIB,600*MIB,'normal','test-frozen',0.1);b.HostAdmission=lambda home:HostAdmission(home,sensor=lambda:s);b.serve(sys.argv[2])";
const child=spawn('python3',['-B','-c',bootstrap,join(process.cwd(),'scripts/runtime'),home,reason],{stdio:['ignore','ignore','pipe']});
let errors='';child.stderr.on('data',v=>errors+=v);const exited=new Promise(r=>child.once('exit',r));
process.env.FORGEWRIGHT_ADMISSION_HOME=home;
try{
 for(let i=0;i<100&&!existsSync(join(home,'broker.sock'));i++)await pause(25);
 assert.ok(existsSync(join(home,'broker.sock')),errors);
 let caught;try{await acquireHostSlot({projectRoot:project,runId:'diagnostic-timeout',memoryMiB:192,waitMs:100});}catch(e){caught=e;}
 assert.equal(caught?.code,'pi_host_capacity_timeout');
 assert.deepEqual(caught.admission,{state:'queued',reason,kind:'worker',requestedMiB:192,waitMs:caught.admission?.waitMs});
 assert.ok(Number.isSafeInteger(caught.admission.waitMs)&&caught.admission.waitMs>=0);
 const status=await getHostAdmissionStatus();assert.equal(status.queued,0);assert.equal(status.active_workers,0);assert.equal(status.quarantined,0);
 console.log(JSON.stringify({code:caught.code,admission:caught.admission,queued:status.queued,active:status.active_workers,telemetry:'synthetic'}));
}finally{if(child.exitCode===null){child.kill('SIGTERM');await exited;}}
"""
    # Darwin AF_UNIX paths are bounded; pytest's descriptive temp path is too long.
    with TemporaryDirectory(prefix="fw-diag-", dir="/tmp") as short_path:
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script, short_path, reason],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=15,
        )
    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout)["admission"]["reason"] == reason


@pytest.mark.parametrize(
    "row_values,expected",
    [
        ({"kind": "heavy", "memoryMiB": 256}, {"kind": "heavy", "requestedMiB": 256}),
        (
            {"kind": "unexpected", "memoryMiB": "256"},
            {"kind": "unknown", "requestedMiB": None},
        ),
        (
            {"kind": "worker", "memoryMiB": 9000},
            {"kind": "worker", "requestedMiB": None},
        ),
    ],
)
def test_timeout_uses_bounded_last_row_provenance(row_values, expected):
    root = Path(__file__).resolve().parents[2]
    # An owned protocol fixture deliberately canonicalizes the request. This
    # tests response provenance, not real scheduler authority or OS readiness.
    script = r"""
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {acquireHostSlot} from './integrations/pi/host-governor.mjs';
const home=join(process.argv[1],'admission');mkdirSync(home,{mode:0o700});
process.env.FORGEWRIGHT_ADMISSION_HOME=home;
const changed=JSON.parse(process.argv[2]),expected=JSON.parse(process.argv[3]),actions=[];
const server=createServer(socket=>{let raw='';socket.on('data',b=>{
 raw+=b.toString();if(!raw.includes('\n'))return;
 const req=JSON.parse(raw.trim());actions.push(req.action);
 const data=req.action==='ping'?{alive:true}:req.action==='release'?{state:'released'}:
  {state:'queued',reason:'insufficient-memory',kind:'worker',memoryMiB:192,waitMs:0,...changed};
 socket.end(JSON.stringify({schema:'forgewright-host-admission/v1',ok:true,data})+'\n');
});});
await new Promise(r=>server.listen(join(home,'broker.sock'),r));
try{
 let caught;try{await acquireHostSlot({projectRoot:process.cwd(),runId:'row-provenance',kind:'worker',memoryMiB:192,waitMs:50});}catch(e){caught=e;}
 assert.equal(caught?.code,'pi_host_capacity_timeout');
 assert.equal(caught.admission.kind,expected.kind);assert.equal(caught.admission.requestedMiB,expected.requestedMiB);
 assert.equal(actions.filter(a=>a==='enqueue').length,1);assert.equal(actions.filter(a=>a==='release').length,1);assert.equal(actions.includes('status'),false);
}finally{await new Promise(r=>server.close(r));}
"""
    with TemporaryDirectory(prefix="fw-row-", dir="/tmp") as short_path:
        result = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                script,
                short_path,
                json.dumps(row_values),
                json.dumps(expected),
            ],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=10,
        )
    assert result.returncode == 0, result.stdout + result.stderr
