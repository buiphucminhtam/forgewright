import json
import subprocess
from pathlib import Path


SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "memory-trace.py"


def write_event(session_dir: Path, node_id: str, turn: int = 1) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    refs_dir = session_dir / "refs"
    refs_dir.mkdir(exist_ok=True)
    (refs_dir / f"{node_id}.md").write_text("full sanitized ref\nline 2\n")
    event = {
        "node_id": node_id,
        "session_id": "session-a",
        "turn_number": turn,
        "tool": "Bash",
        "args_hash": "abc123",
        "summary": "ran a command",
        "status": "done",
        "result_ref": f"refs/{node_id}.md",
        "tokens_original": 1200,
        "tokens_summary": 12,
        "created_at": "2026-06-23T00:00:00.000Z",
        "source": "mcp-context-offload",
    }
    with (session_dir / "events.jsonl").open("a") as handle:
        handle.write(json.dumps(event) + "\n")


def run_trace(data_dir: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(SCRIPT), "--data-dir", str(data_dir), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_trace_node_prints_event_and_ref_preview(tmp_path):
    data_dir = tmp_path / "offload"
    write_event(data_dir / "session-a", "n1")

    result = run_trace(data_dir, "trace-node", "n1", "--session", "session-a")

    assert result.returncode == 0
    assert "Node: n1" in result.stdout
    assert "Status: done" in result.stdout
    assert "--- Ref Preview ---" in result.stdout
    assert "full sanitized ref" in result.stdout


def test_trace_session_ignores_corrupt_jsonl_lines(tmp_path):
    data_dir = tmp_path / "offload"
    session_dir = data_dir / "session-a"
    write_event(session_dir, "n1")
    (session_dir / "events.jsonl").write_text(
        (session_dir / "events.jsonl").read_text() + "not-json\n"
    )

    result = run_trace(data_dir, "trace-session", "session-a")

    assert result.returncode == 0
    assert "Session: session-a" in result.stdout
    assert "Events: 1" in result.stdout
    assert "- n1 [done]" in result.stdout


def test_trace_canvas_generates_mermaid_when_canvas_file_is_absent(tmp_path):
    data_dir = tmp_path / "offload"
    session_dir = data_dir / "session-a"
    write_event(session_dir, "n1", turn=1)
    write_event(session_dir, "n2", turn=2)

    result = run_trace(data_dir, "trace-canvas", "session-a")

    assert result.returncode == 0
    assert "flowchart TD" in result.stdout
    assert "id: n1" in result.stdout
    assert "id: n2" in result.stdout
    assert "-->" in result.stdout


def test_trace_node_json_mode_returns_raw_event(tmp_path):
    data_dir = tmp_path / "offload"
    write_event(data_dir / "session-a", "n1")

    result = run_trace(data_dir, "trace-node", "n1", "--session", "session-a", "--json")

    assert result.returncode == 0
    event = json.loads(result.stdout)
    assert event["node_id"] == "n1"
    assert event["result_ref"] == "refs/n1.md"
