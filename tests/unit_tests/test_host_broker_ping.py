"""The broker liveness probe is not a second expensive admission/status scan."""

from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_admission_broker import dispatch, PROTOCOL  # noqa: E402
from host_admission import AdmissionError  # noqa: E402


def test_ping_does_not_read_sensors_or_grant_a_lease():
    class NoAuthority:
        def __getattr__(self, name):
            raise AssertionError(
                "Liveness probe must not query or mutate admission: " + name
            )

    assert dispatch(NoAuthority(), {"schema": PROTOCOL, "action": "ping"}) == {
        "protocol": PROTOCOL,
        "alive": True,
    }


def test_ping_rejects_payload_and_status_still_reads_current_state():
    with pytest.raises(AdmissionError, match="invalid-request"):
        dispatch(None, {"schema": PROTOCOL, "action": "ping", "owner_pid": 5})

    class ActualStatus:
        calls = 0

        def status(self):
            self.calls += 1
            return {"paused": True, "pressure": "critical"}

    admission = ActualStatus()
    assert (
        dispatch(admission, {"schema": PROTOCOL, "action": "status"})["paused"] is True
    )
    assert admission.calls == 1
