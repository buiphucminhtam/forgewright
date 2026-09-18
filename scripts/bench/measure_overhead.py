#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def get_file_size(p: Path) -> int:
    return p.stat().st_size if p.exists() else 0


def measure_instructions():
    agents_md = REPO_ROOT / "AGENTS.md"
    agents_bytes = get_file_size(agents_md)

    cmd = [
        "python3",
        str(REPO_ROOT / "scripts/lite/sync-kernel.py"),
        "--codex-candidate-preview",
        "--json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    candidate_data = json.loads(proc.stdout) if proc.returncode == 0 else {}
    candidate_bytes = candidate_data.get("static_utf8_bytes", 0)

    return {
        "baseline_agents_md_bytes": agents_bytes,
        "baseline_agents_md_tokens_approx": agents_bytes // 4,
        "candidate_codex_profile_bytes": candidate_bytes,
        "candidate_codex_profile_tokens_approx": candidate_bytes // 4,
        "reduction_bytes": agents_bytes - candidate_bytes,
        "reduction_percent": round(
            ((agents_bytes - candidate_bytes) / agents_bytes) * 100, 2
        )
        if agents_bytes
        else 0,
    }


def measure_skills():
    skills_dir = REPO_ROOT / "skills"
    results = {}
    total_baseline = 0
    total_optimized = 0

    for skill_name in ["software-engineer", "skill-maker"]:
        skill_file = skills_dir / skill_name / "SKILL.md"
        current_bytes = get_file_size(skill_file)

        cmd = ["git", "show", f"HEAD:skills/{skill_name}/SKILL.md"]
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
        head_bytes = (
            len(proc.stdout.encode("utf-8")) if proc.returncode == 0 else current_bytes
        )

        results[skill_name] = {
            "baseline_head_bytes": head_bytes,
            "optimized_bytes": current_bytes,
            "reduction_percent": round(
                ((head_bytes - current_bytes) / head_bytes) * 100, 2
            )
            if head_bytes
            else 0,
        }
        total_baseline += head_bytes
        total_optimized += current_bytes

    return {
        "skills": results,
        "total_baseline_bytes": total_baseline,
        "total_optimized_bytes": total_optimized,
        "total_reduction_percent": round(
            ((total_baseline - total_optimized) / total_baseline) * 100, 2
        )
        if total_baseline
        else 0,
    }


def measure_all():
    return {
        "target_goal": "FW-CODEX-EFF-20260913",
        "amendment": "EFF-20260918",
        "work_package": "EFF-01",
        "instruction_overhead": measure_instructions(),
        "skill_overlay_overhead": measure_skills(),
    }


if __name__ == "__main__":
    data = measure_all()
    print(json.dumps(data, indent=2))
