"""Bootstrap observes Pi status without granting activation or accepting failures."""

from __future__ import annotations

import json
import sys

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline


@pytest.fixture
def adapter(tmp_path, monkeypatch):
    real = baseline.module()
    entry = tmp_path / "status_cli.py"
    monkeypatch.setenv("FORGEWRIGHT_CLI_ENTRY", str(entry))
    monkeypatch.setenv("FORGEWRIGHT_NODE", sys.executable)
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_HOME", str(tmp_path / "home"))

    def reply(payload, exit_code=0):
        entry.write_text(
            "import sys\n"
            "assert sys.argv[1] == '--json'\n"
            f"print({json.dumps(json.dumps(payload))})\n"
            f"sys.exit({exit_code})\n"
        )

    return real, tmp_path, reply


@pytest.mark.parametrize("explicit", [False, True])
@pytest.mark.parametrize("ready", [False, True])
def test_generic_and_explicit_pi_status_transport(adapter, explicit, ready):
    real, project, reply = adapter
    payload = {"worker": "pi", "ready": ready, "enabled": ready}
    reply(payload)
    args = ["delegate", "status", *(["--worker", "pi"] if explicit else [])]
    result = real.call_forge(args, project=project, required=True, stage="pi_status")
    assert result["status"] == "ready"
    assert json.loads(result["stdout"]) == payload


@pytest.mark.parametrize("explicit", [False, True])
@pytest.mark.parametrize("required", [False, True])
@pytest.mark.parametrize(
    "payload",
    [
        {"worker": "pi", "ready": True, "enabled": True, "ok": False},
        {"worker": "other", "ready": True, "enabled": True},
        {"worker": "pi", "ready": "true", "enabled": True},
        {"worker": "pi", "ready": True, "enabled": 1},
        {"worker": "pi", "enabled": True},
        {"worker": "pi", "ready": True},
        {"worker": "pi", "ready": True, "enabled": True, "ok": None},
    ],
)
def test_pi_status_invalid_or_failed_json_is_rejected(
    adapter, explicit, required, payload
):
    real, project, reply = adapter
    reply(payload)
    args = ["delegate", "status", *(["--worker", "pi"] if explicit else [])]
    if required:
        with pytest.raises(real.BootstrapError, match="unsuccessful JSON"):
            real.call_forge(args, project=project, required=True, stage="pi_status")
    else:
        assert (
            real.call_forge(args, project=project, required=False, stage="pi_status")[
                "status"
            ]
            == "degraded"
        )


@pytest.mark.parametrize("args", [["init"], ["delegate", "run"]])
def test_pi_status_shape_does_not_authorize_other_commands(adapter, args):
    real, project, reply = adapter
    reply({"worker": "pi", "ready": True, "enabled": True})
    assert (
        real.call_forge(args, project=project, required=False, stage="other")["status"]
        == "degraded"
    )


def test_successful_standard_envelope_is_preserved(adapter):
    real, project, reply = adapter
    reply({"ok": True, "data": {"ready": True}})
    assert (
        real.call_forge(["init"], project=project, required=True, stage="init")[
            "status"
        ]
        == "ready"
    )


def test_nonzero_status_exit_is_not_success(adapter):
    real, project, reply = adapter
    reply({"worker": "pi", "ready": True, "enabled": True}, exit_code=1)
    result = real.call_forge(
        ["delegate", "status"], project=project, required=False, stage="pi_status"
    )
    assert result["status"] == "degraded"
    assert result["exit_code"] == 1


@pytest.mark.parametrize(
    "ready,enabled,model",
    [(False, True, "chosen"), (True, False, "chosen"), (True, True, "other")],
)
def test_parsed_status_does_not_promote_unready_or_wrong_model(
    adapter, ready, enabled, model
):
    real, project, reply = adapter
    reply({"worker": "pi", "ready": ready, "enabled": enabled, "model": model})
    result = real.pi_prepare(
        {"pi_policy": "existing-subscription-only", "pi_model": "chosen"}, project
    )
    assert result["status"] == "degraded"
    assert result["detail"] == "explicit_pi_setup_required"
