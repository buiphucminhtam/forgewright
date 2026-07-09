import json
import sqlite3
import subprocess
from pathlib import Path


SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "memory-consolidate.py"


def create_memory_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE observations (
            id INTEGER PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT DEFAULT 'manual',
            created_at TEXT NOT NULL,
            created_at_epoch INTEGER NOT NULL,
            archived INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        INSERT INTO observations (
            id, type, title, content, source, created_at, created_at_epoch, archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            1,
            "decisions",
            "Use Forgewright gates",
            "Decision: always use Forgewright gate approval before moving phases.",
            "manual",
            "2026-06-23T00:00:00",
            1,
            0,
        ),
    )
    conn.commit()
    conn.close()


def create_session_log(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "sessions": [
                    {
                        "session_id": "session-a",
                        "status": "completed",
                        "mode": "Feature",
                        "request_summary": "Upgrade memory retrieval",
                        "summary": "Added scenario and persona layers",
                        "completed_tasks": [
                            "Generated persona.md",
                            "Generated scenario file",
                        ],
                    }
                ]
            }
        )
    )


def create_offload_events(workspace: Path) -> None:
    session_dir = workspace / ".forgewright" / "offload" / "session-a"
    session_dir.mkdir(parents=True, exist_ok=True)
    event = {
        "node_id": "n1",
        "session_id": "session-a",
        "turn_number": 1,
        "tool": "Bash",
        "summary": "test command completed",
        "status": "done",
        "result_ref": "refs/n1.md",
    }
    (session_dir / "events.jsonl").write_text(json.dumps(event) + "\n")


def test_consolidate_writes_persona_and_scenario_with_source_refs(tmp_path):
    workspace = tmp_path
    db_path = workspace / ".forgewright" / "memory.db"
    create_memory_db(db_path)
    create_session_log(workspace / ".forgewright" / "session-log.json")
    create_offload_events(workspace)

    result = subprocess.run(
        [
            "python3",
            str(SCRIPT),
            "--workspace",
            str(workspace),
            "--memory-db",
            str(db_path),
            "--json",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    persona = Path(payload["persona"])
    scenario = Path(payload["scenarios"][0])

    assert persona.exists()
    assert scenario.exists()
    assert "schema: forgewright-memory-persona/v1" in persona.read_text()
    assert "mem0:1" in persona.read_text()
    assert "offload:session-a/n1" in persona.read_text()
    assert "schema: forgewright-memory-scenario/v1" in scenario.read_text()
    assert "Generated persona.md" in scenario.read_text()
    assert "offload:session-a/n1" in scenario.read_text()
