#!/usr/bin/env python3
"""
Goal-Driven Workflow - State Management

Manages goal state persistence across sessions.
"""

import json
from datetime import datetime
from pathlib import Path

GOAL_FILE = ".forgewright/active-goal.json"


def get_goal_dir():
    """Ensure .forgewright directory exists."""
    Path(".forgewright").mkdir(exist_ok=True)
    return Path(".forgewright")


def create_goal(condition: str, created_by: str = "user") -> dict:
    """Create a new goal."""
    goal = {
        "goal_id": f"goal-{datetime.now().strftime('%Y%m%d-%H%M')}",
        "condition": condition,
        "created_at": datetime.now().isoformat(),
        "created_by": created_by,
        "turns": 0,
        "last_evaluation": None,
        "status": "active",
        "history": [],
    }

    goal_file = get_goal_dir() / "active-goal.json"
    with open(goal_file, "w") as f:
        json.dump(goal, f, indent=2)

    return goal


def get_goal() -> dict | None:
    """Get current active goal."""
    goal_file = Path(GOAL_FILE)
    if not goal_file.exists():
        return None

    with open(goal_file) as f:
        return json.load(f)


def update_evaluation(result: str, reason: str) -> dict:
    """Update goal with new evaluation."""
    goal = get_goal()
    if not goal:
        return None

    goal["turns"] += 1
    goal["last_evaluation"] = {
        "at": datetime.now().isoformat(),
        "result": result,
        "reason": reason,
    }

    # Add to history
    goal["history"].append(
        {
            "turn": goal["turns"],
            "at": datetime.now().isoformat(),
            "result": result,
            "reason": reason,
        }
    )

    goal_file = get_goal_dir() / "active-goal.json"
    with open(goal_file, "w") as f:
        json.dump(goal, f, indent=2)

    return goal


def set_goal_status(status: str) -> dict:
    """Set goal status (active, completed, cleared)."""
    goal = get_goal()
    if not goal:
        return None

    goal["status"] = status
    if status == "completed":
        goal["completed_at"] = datetime.now().isoformat()

    goal_file = get_goal_dir() / "active-goal.json"
    with open(goal_file, "w") as f:
        json.dump(goal, f, indent=2)

    return goal


def clear_goal() -> bool:
    """Clear the active goal."""
    goal_file = Path(GOAL_FILE)
    if goal_file.exists():
        goal_file.unlink()
        return True
    return False


def get_status() -> dict:
    """Get goal status summary."""
    goal = get_goal()
    if not goal:
        return {"status": "no_goal", "message": "No active goal"}

    return {
        "status": goal["status"],
        "goal_id": goal["goal_id"],
        "condition": goal["condition"],
        "turns": goal["turns"],
        "last_evaluation": goal.get("last_evaluation"),
        "created_at": goal["created_at"],
    }


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: goal-state.py [create|get|update|clear|status]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "create":
        condition = sys.argv[2] if len(sys.argv) > 2 else input("Goal condition: ")
        goal = create_goal(condition)
        print(f"✓ Goal created: {goal['goal_id']}")
        print(f"  Condition: {goal['condition']}")

    elif cmd == "get":
        goal = get_goal()
        if goal:
            print(json.dumps(goal, indent=2))
        else:
            print("No active goal")

    elif cmd == "update":
        if len(sys.argv) < 4:
            print("Usage: goal-state.py update <result> <reason>")
            sys.exit(1)
        result, reason = sys.argv[2], sys.argv[3]
        goal = update_evaluation(result, reason)
        print(f"✓ Evaluation updated (Turn {goal['turns']})")

    elif cmd == "status":
        status = get_status()
        print(json.dumps(status, indent=2))

    elif cmd == "clear":
        if clear_goal():
            print("✓ Goal cleared")
        else:
            print("No goal to clear")

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
