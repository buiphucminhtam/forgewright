#!/usr/bin/env python3
import os
import sys
import json
import re
import argparse
import subprocess
from typing import List

NOTEBOOK_ID = "39238918-b1fb-4c91-8422-4af06d08326a"


def log_info(msg):
    print(f"\033[96m[*] {msg}\033[0m")


def log_success(msg):
    print(f"\033[92m[✓] {msg}\033[0m")


def log_warning(msg):
    print(f"\033[93m[!] {msg}\033[0m")


def log_error(msg):
    print(f"\033[91m[✗] {msg}\033[0m")


def get_remaining_skills(skills_dir: str) -> List[str]:
    """Find all skill directories missing LITE.md"""
    skills = []
    exclude = {"_shared", "_test", "generated"}
    for entry in os.scandir(skills_dir):
        if entry.is_dir() and entry.name not in exclude:
            lite_path = os.path.join(entry.path, "LITE.md")
            if not os.path.exists(lite_path):
                skills.append(entry.name)
    return sorted(skills)


def query_notebooklm(skill_name: str) -> str:
    """Query NotebookLM CLI to research and generate the LITE.md content"""
    prompt = (
        f"You are a Forgewright Skill Distiller. The user is upgrading the '{skill_name}' skill to Forgewright Lite (Stage E3 overlay).\n"
        f"Research the '{skill_name}' specialty in the notebook. Distill the senior domain expertise into a minimal LITE.md under 200 lines.\n"
        f"ARCHITECTURE BOUNDARY: the Forgewright pipeline already owns outcome/scope consulting, cross-domain hidden-risk scanning, generic research/instruction-boundary safety, VERIFY/AUDIT/LEARN, and generic visual-basis gating. Assume the skill receives PIPELINE_CONTEXT. Do NOT duplicate those generic operating loops.\n"
        f"The overlay must expose specialist depth: domain authority/inputs, real discipline heuristics, domain artifacts, domain failure modes, domain verifiers, and handoff/cross-domain DOMAIN_FINDING behavior. If text could be pasted unchanged into an unrelated skill, it is too generic.\n"
        f"The output must strictly follow the Forgewright Lite markdown template:\n\n"
        f"---\n"
        f"name: {skill_name}\n"
        f'description: "Use when <trigger conditions only; do not describe the workflow, implementation steps, or skill behavior>."\n'
        f"version: 1.0.0\n"
        f"---\n\n"
        f"# {skill_name.replace('-', ' ').title()} (LITE)\n\n"
        f"## SOLVE Step 2: GROUND ({skill_name.replace('-', ' ').title()} Domain Slots)\n"
        f"| Assumption | Check command / file read | Result | VERIFIED? |\n"
        f"|---|---|---|---|\n"
        f"<3-6 specialist input/grounding checks unique to this domain; consume PIPELINE_CONTEXT rather than recreating it>\n\n"
        f"## SOLVE Step 3: DECOMPOSE ({skill_name.replace('-', ' ').title()} Domain Slots)\n"
        f"Format: `n. ACTION | TARGET | CHECK`\n"
        f"<3-7 specialist action templates using real domain vocabulary, artifacts and verifiers>\n\n"
        f"## Domain Failure Modes\n"
        f"<4-8 mistakes a non-specialist or weak model commonly misses in this discipline, with evidence/sign and correction>\n\n"
        f"## Domain Handoff\n"
        f"<what this skill hands downstream; scope-changing/cross-domain facts return to the pipeline as DOMAIN_FINDING>\n\n"
        f"Ensure the output is clean Markdown starting with the '---' block. Do not add any conversational text or commentary outside the markdown."
    )

    cmd = ["nlm", "notebook", "query", NOTEBOOK_ID, prompt]
    log_info(f"Running NotebookLM query for skill '{skill_name}'...")

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        log_error(f"NotebookLM CLI command failed: {res.stderr}")
        return ""

    return res.stdout.strip()


def parse_markdown(raw_output: str) -> str:
    """Clean and extract only the markdown block from raw output"""
    content = raw_output
    # Try parsing as JSON first (handles when nlm returns JSON structured output)
    try:
        data = json.loads(raw_output)
        if isinstance(data, dict):
            if (
                "value" in data
                and isinstance(data["value"], dict)
                and "answer" in data["value"]
            ):
                content = data["value"]["answer"]
            elif "answer" in data:
                content = data["answer"]
    except Exception:
        pass  # Not a valid JSON, use raw text

    # Find the frontmatter --- block
    match = re.search(r"---[\s\S]+?---[\s\S]+", content)
    if match:
        return match.group(0).strip()
    return content


def _extract_frontmatter_fields(content: str, fallback_name: str) -> tuple[str, str]:
    """Extract name and description from YAML frontmatter without external deps."""
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not fm_match:
        return fallback_name, ""

    lines = fm_match.group(1).splitlines()
    name = fallback_name
    desc = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("name:"):
            raw_name = line.split(":", 1)[1].strip().strip("\"'")
            if raw_name:
                name = raw_name
            i += 1
            continue
        if line.startswith("description:"):
            raw_val = line.split(":", 1)[1].strip()
            if raw_val in {">", "|", ">-", "|-"}:
                block_lines = []
                i += 1
                while i < len(lines):
                    nxt = lines[i]
                    if nxt.strip() == "":
                        i += 1
                        continue
                    if nxt.startswith((" ", "\t")):
                        block_lines.append(nxt.strip())
                        i += 1
                    else:
                        break
                desc = " ".join(block_lines).strip()
                continue
            desc = raw_val.strip("\"'")
        i += 1
    return name, desc


def _normalize_trigger(desc: str) -> str:
    """Derive a clean, untruncated trigger phrase from a skill description."""
    triggers = re.sub(r"\s+", " ", desc).strip()
    if "Use when" in triggers:
        triggers = triggers.split("Use when", 1)[1].strip()
        triggers = re.sub(
            r"^(?:the user\s+)?(?:requests|reports|asks(?:\s+(?:to|for))?)\s+",
            "",
            triggers,
            flags=re.IGNORECASE,
        ).strip()
    triggers = triggers.rstrip(".")
    if triggers:
        triggers = triggers[0].upper() + triggers[1:]
    return triggers


def update_index(skills_dir: str, index_path: str):
    """Regenerate kernel/INDEX.md dynamically by scanning all LITE.md files"""
    log_info("Regenerating Skill Index (kernel/INDEX.md)...")

    skills_data = []
    exclude = {"_shared", "_test", "generated"}

    for entry in sorted(os.scandir(skills_dir), key=lambda e: e.name):
        if entry.is_dir() and entry.name not in exclude:
            lite_path = os.path.join(entry.path, "LITE.md")
            if os.path.exists(lite_path):
                try:
                    with open(lite_path, "r", encoding="utf-8") as f:
                        content = f.read()

                    name, desc = _extract_frontmatter_fields(content, entry.name)
                    triggers = _normalize_trigger(desc)
                    rel_path = f"skills/{entry.name}/LITE.md"
                    skills_data.append(
                        {"name": name, "triggers": triggers, "path": rel_path}
                    )
                except Exception as e:
                    log_warning(f"Failed to parse LITE.md in {entry.name}: {e}")

    # Write INDEX.md
    lines = [
        "# Skill Index\n",
        "This index maps skill names to their triggers and the file path of their respective LITE.md overlays. During the boot sequence, load at most one skill overlay matching the task class.\n",
        "| Skill Name | Triggers | Trigger File |\n",
        "|---|---|---|\n",
    ]

    for skill in skills_data:
        safe_trigger = skill["triggers"].replace("|", "\\|")
        lines.append(
            f"| **{skill['name']}** | {safe_trigger} | [{skill['path']}](../{skill['path']}) |\n"
        )

    with open(index_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    log_success(
        f"Skill Index regenerated at {index_path} ({len(skills_data)} skills mapped)"
    )


def main():
    parser = argparse.ArgumentParser(description="Forgewright Lite Skill Upgrader")
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum number of skills to process in this run",
    )
    parser.add_argument(
        "--skill", type=str, help="Process a single specific skill only"
    )
    parser.add_argument(
        "--index-only",
        action="store_true",
        help="Only regenerate kernel/INDEX.md from existing skills/*/LITE.md files",
    )
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, "..", ".."))
    skills_dir = os.path.join(repo_root, "skills")
    index_path = os.path.join(repo_root, "kernel", "INDEX.md")

    if args.index_only:
        update_index(skills_dir, index_path)
        sys.exit(0)

    # 1. Single skill mode
    if args.skill:
        remaining = [args.skill]
    else:
        # Get list of remaining skills
        remaining = get_remaining_skills(skills_dir)
        log_info(f"Total skills remaining to upgrade: {len(remaining)}")
        if not remaining:
            log_success("All skills upgraded! Regenerating index just in case...")
            update_index(skills_dir, index_path)
            sys.exit(0)

        remaining = remaining[: args.limit]

    log_info(f"Upgrading skills batch: {remaining}")

    processed_count = 0
    for skill in remaining:
        log_info(
            f"--- Upgrading skill '{skill}' ({processed_count + 1}/{len(remaining)}) ---"
        )
        raw_markdown = query_notebooklm(skill)
        if not raw_markdown:
            log_error(
                f"Failed to get output for skill '{skill}' from NotebookLM. Skipping."
            )
            continue

        clean_markdown = parse_markdown(raw_markdown)
        candidate_dir = os.path.join(
            repo_root, ".forgewright", "runtime", "skill-candidates", skill
        )
        os.makedirs(candidate_dir, exist_ok=True)
        candidate_path = os.path.join(candidate_dir, "LITE.md")
        with open(candidate_path, "w") as f:
            f.write(clean_markdown + "\n")

        log_success(f"Staged candidate for '{skill}' at {candidate_path}")
        log_info(
            "Canonical skill/index remain unchanged. Evaluate baseline/current/candidate "
            "with scripts/runtime/skill_quality.py, then use its 'promote' command with "
            "the SHA-bound promotion report."
        )
        processed_count += 1

    # Candidate generation is deliberately separate from promotion. Never update
    # kernel/INDEX.md or shared skill files until behavioral evidence approves the
    # exact candidate bytes.
    if processed_count > 0:
        log_success(
            f"Batch completed. Staged {processed_count} candidate skill(s); 0 promoted."
        )
    elif not args.skill:
        update_index(skills_dir, index_path)

    log_success("Skill promotion remains evidence-gated.")


if __name__ == "__main__":
    main()
