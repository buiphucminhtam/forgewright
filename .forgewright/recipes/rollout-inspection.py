"""Read only fixed rollout source hashes and the existing Arrow schedule."""

import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]
DEPLOYED = Path(
    "/Users/buiphucminhtam/.codex/worktrees/host-resource-control/forgewright"
)
TASK = ROOT / ".forgewright/verify/resource-rollout-completion"


def read(path, limit):
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise RuntimeError("fixed inspection path redirected")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_size > limit
        ):
            raise RuntimeError("fixed inspection input unavailable")
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise RuntimeError("fixed inspection input exceeded bound")
        return raw


def main():
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(DEPLOYED / "scripts/runtime"))
    from project_recipe import require_managed

    require_managed(ROOT)
    sources = {
        name: hashlib.sha256(read(TASK / name, 262144)).hexdigest()
        for name in ("validation-controller.py", "result-reader.py")
    }
    schedule = (
        Path.home()
        / ".codex/automations/ti-p-t-c-linehold-khi-m-y-r-nh/automation.toml"
    )
    automation = {"status": "missing"}
    if schedule.exists():
        value = tomllib.loads(read(schedule, 32768).decode())
        allowed = {
            "version",
            "id",
            "name",
            "prompt",
            "status",
            "rrule",
            "kind",
            "model",
            "reasoning_effort",
            "reasoningEffort",
            "project_id",
            "projectId",
            "cwds",
            "target_thread_id",
            "targetThreadId",
            "thread_id",
            "destination",
            "execution_environment",
            "executionEnvironment",
            "notification_policy",
            "notificationPolicy",
            "created_at",
            "updated_at",
        }
        automation = {k: v for k, v in value.items() if k in allowed}
    output = json.dumps(
        {"source_sha256": sources, "automation": automation},
        ensure_ascii=False,
        default=str,
    )
    if len(output.encode()) > 16384:
        raise RuntimeError("fixed inspection output exceeded bound")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
