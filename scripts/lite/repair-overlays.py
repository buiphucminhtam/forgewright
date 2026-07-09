#!/usr/bin/env python3
"""
repair-overlays.py
==================
Fixes all LITE.md skill overlays per Kernel v3 requirements:
  1. Replace VERIFIED? / Y/N columns with Script-produced evidence column
  2. Remove fabricated Worked Example sections (fake SDK, fake paths, fake transcripts)
  3. Strip orphan numeric citations [1], [2, 5] etc from prose
  4. Remove sync-obsidian boilerplate SYNC steps
  5. Remove ungrounded constraints: Temperature 1.0, ECE thresholds, zero pixel drift
  6. Remove guaranteed-absent paths: .forgewright/project-profile.json, .agents/workflows,
     forgewright-gemini-sdk, src/GeminiGuardrail.ts, test-gemini-behavior.js
  7. Strip trailing whitespace from all lines
  8. Remove illustrative NOTE callouts and the worked-example block below code-reviewer
     that contains fake VERIFY blocks with pasted output
"""

import os
import re
import sys

DRY_RUN = "--dry-run" in sys.argv
VERBOSE = "--verbose" in sys.argv or DRY_RUN

SKILLS_DIR = "skills"

# ── Patterns ──────────────────────────────────────────────────────────────────

# Inline orphan citations: [1], [2, 5], [1, 2, 3] but NOT [link text](url) style
CITATION_INLINE = re.compile(r"\s*\[(\d+(?:,\s*\d+)*)\](?!\s*[:\(])")

# The > [!NOTE] / > The following example is illustrative block
ILLUSTRATIVE_NOTE = re.compile(
    r">\s*\[!NOTE\]\s*\n>\s*The following example is illustrative\.\s*\n?", re.MULTILINE
)

# Fake SDK / fake paths / fake commands that must not appear
BANNED_PATTERNS = [
    (re.compile(r"forgewright-gemini-sdk"), "forgewright-gemini-sdk"),
    (re.compile(r"src/GeminiGuardrail\.ts"), "src/GeminiGuardrail.ts"),
    (re.compile(r"test-gemini-behavior\.js"), "test-gemini-behavior.js"),
]

# Banned unverified absolute claims in free text (not in code blocks)
BANNED_FREETEXT = [
    # mandatory Temperature 1.0 claim
    (re.compile(r",?\s*specifically Temperature 1\.0 and"), ""),
    (re.compile(r",?\s*focusing on Temperature 1\.0 and"), ""),
    (
        re.compile(
            r"(mandatory |the optimal )?Temperature 1\.0 (rule |native configuration )?for Gemini 3\.x[^\n]*"
        ),
        "",
    ),
    (
        re.compile(
            r"Hardcoding (Overridden )?Temperatures[^\n]*Temperature[^\n]*(1\.0|0\.7)[^\n]*\n"
        ),
        "",
    ),
    # ECE thresholds
    (re.compile(r"Expected Calibration Error \(ECE\)\s*[<>=]+\s*0\.10[^\n]*"), ""),
    (re.compile(r"ECE[^\n]*0\.10[^\n]*"), ""),
    (re.compile(r"ece_threshold[^\n]*"), ""),
    # zero pixel drift
    (re.compile(r"zero pixel-level drift[^\n]*"), "zero layout drift"),
    (re.compile(r"verify zero pixel[^\n]*"), "identify layout regressions"),
]

# sync-obsidian SYNC step patterns (entire step line)
SYNC_STEP_LINE = re.compile(r"^(\d+)\.\s+SYNC\s*\|[^\n]+\n?", re.MULTILINE)

# .agents/workflows guaranteed path in prose
AGENTS_WORKFLOWS_GROUND = re.compile(
    r"\|\s*[^|]+\|\s*`cat \.agents/workflows/`[^|]*\|[^\n]+\|[^\n]+\|?\s*\n?"
)

# project-profile.json as a guaranteed file row in GROUND table
PROJECT_PROFILE_GROUND = re.compile(
    r"\|\s*[Pp]roject stack[^|]*profile[^|]*\|\s*`cat \.forgewright/project-profile\.json`[^|]*\|[^\n]+\n?"
)

# Worked Example section (entire section through EOF or next ##)
WORKED_EXAMPLE_SECTION = re.compile(
    r"## Worked Example.*?(?=^##|\Z)", re.DOTALL | re.MULTILINE
)

# Files that are allowed to keep Worked Example (code-reviewer has a valid one
# but it contains self-attested VERIFIED? / Y columns → needs partial fix)
# We'll handle code-reviewer separately.
KEEP_WORKED_EXAMPLE_SKILLS = {"code-reviewer"}

# Fake VERIFY block inside code-reviewer worked example:
# The "VERIFY" section with pasted output and EXIT CODE: 0 / VERDICT: PASS
FAKE_VERIFY_BLOCK = re.compile(r"### 5\. VERIFY\n.*?VERDICT: PASS\n?", re.DOTALL)

# Self-attested Y column in ground tables within worked examples
SELF_ATTESTED_Y = re.compile(
    r"(\|[^|]+\|[^|]+\|[^|]+\|)\s*Y\s*(\|?)\s*\n",
)

# "Result | VERIFIED?" header → "Script-produced evidence"
VERIFIED_HEADER_LINE = re.compile(r"\|\s*Result\s*\|\s*VERIFIED\?\s*\|", re.IGNORECASE)

VERIFIED_SEP_LINE = re.compile(
    r"(\|---\|---\|---\|)---\|",
)

GROUND_DATA_ROW = re.compile(
    r"(\|[^|]+\|[^|]+\|)\s*\.\.\.\s*\|\s*Y/N\s*\|",
)

GROUND_DATA_ROW_INLINE = re.compile(
    r"(\|[^|]+\|[^|]+\|[^|]+)\|\s*Y/N\s*\|",
)

# ── Per-file repairs ───────────────────────────────────────────────────────────


def skill_name_from_path(filepath):
    parts = filepath.replace("\\", "/").split("/")
    for i, p in enumerate(parts):
        if p == "skills" and i + 1 < len(parts):
            return parts[i + 1]
    return ""


def fix_ground_table(content):
    """
    Replace:  | Result | VERIFIED? |  →  | Result | Script-produced evidence |
    Separator:  |---|---|---|---|  stays as 4-col
    Data rows:  | ... | Y/N |  →  | ... | run the check command and paste output |
    And rows with self-attested Y.
    """
    lines = content.split("\n")
    out = []
    in_ground = False
    current_section = ""

    for line in lines:
        stripped = line.strip()

        # Track section
        if stripped.startswith("#"):
            current_section = stripped.lower()
            in_ground = (
                "solve step 2" in current_section and "ground" in current_section
            )
            out.append(line)
            continue

        if in_ground and "|" in line:
            # Repair headers already collapsed by earlier versions:
            # | Assumption | Check command / file read | Script-produced evidence |
            if re.search(
                r"\|\s*Assumption\s*\|\s*Check command / file read\s*\|\s*Script-produced evidence\s*\|",
                line,
                re.IGNORECASE,
            ):
                line = re.sub(
                    r"\|\s*Assumption\s*\|\s*Check command / file read\s*\|\s*Script-produced evidence\s*\|",
                    "| Assumption | Check command / file read | Result | Script-produced evidence |",
                    line,
                    flags=re.IGNORECASE,
                )
            # Header: replace Result | VERIFIED? with Script-produced evidence
            elif re.search(r"\|\s*Result\s*\|\s*VERIFIED\?\s*\|", line, re.IGNORECASE):
                line = re.sub(
                    r"\|\s*Result\s*\|\s*VERIFIED\?\s*\|",
                    "| Result | Script-produced evidence |",
                    line,
                    flags=re.IGNORECASE,
                )
            # Repair rows already collapsed by earlier versions of this script:
            # | assumption | check | run the check command above |
            elif re.search(r"\|\s*run the check command above\s*\|", line):
                cells = re.split(r"(?<!\\)(?<!\|)\|(?!\|)", line)
                if (
                    len(cells) == 5
                    and cells[3].strip() == "run the check command above"
                ):
                    line = (
                        f"| {cells[1].strip()} | {cells[2].strip()} | ... | "
                        "run the check command and paste output |"
                    )
                else:
                    line = re.sub(
                        r"\|\s*run the check command above\s*\|",
                        "| ... | run the check command and paste output |",
                        line,
                    )
            # Data rows: ... | Y/N | → run the check command above |
            elif re.search(r"\|\s*\.\.\.\s*\|\s*Y/N\s*\|", line):
                line = re.sub(
                    r"\|\s*\.\.\.\s*\|\s*Y/N\s*\|",
                    "| ... | run the check command and paste output |",
                    line,
                )
            # Also handle: | ... | Y | (self-attested)
            elif re.search(r"\|\s*\.\.\.\s*\|\s*Y\s*\|", line):
                line = re.sub(
                    r"\|\s*\.\.\.\s*\|\s*Y\s*\|",
                    "| ... | run the check command and paste output |",
                    line,
                )
            # Handle rows that have a result cell and Y/N
            elif re.search(r"\|\s*Y/N\s*\|", line):
                line = re.sub(
                    r"\|\s*Y/N\s*\|", "| run the check command and paste output |", line
                )

        out.append(line)

    return "\n".join(out)


def strip_orphan_citations(text):
    """Remove [1], [2, 5] etc from prose (not inside code blocks)."""
    # Process line by line to avoid disturbing code blocks
    lines = text.split("\n")
    out = []
    in_code = False
    for line in lines:
        if line.strip().startswith("```"):
            in_code = not in_code
        if not in_code:
            line = CITATION_INLINE.sub("", line)
        out.append(line)
    return "\n".join(out)


def remove_sync_step(content):
    """
    Remove SYNC steps that reference obsidian/sync-obsidian.
    Only remove the step if it contains obsidian/sync-obsidian/symlink keywords.
    """
    lines = content.split("\n")
    out = []
    for line in lines:
        lower = line.lower()
        if re.match(r"^\d+\.\s+SYNC\s*\|", line.strip()):
            if any(
                kw in lower for kw in ["obsidian", "sync-obsidian", "symlink", "vault"]
            ):
                continue  # drop this step
        out.append(line)
    return "\n".join(out)


def remove_banned_freetext(content):
    """Apply banned freetext patterns outside code blocks."""
    lines = content.split("\n")
    out = []
    in_code = False
    for line in lines:
        if line.strip().startswith("```"):
            in_code = not in_code
        if not in_code:
            for pat, replacement in BANNED_FREETEXT:
                line = pat.sub(replacement, line)
            # Clean up empty mistake bullets
            if re.match(r"^-\s+\*\*[^*]+\*\*:\s*$", line.strip()):
                continue
        out.append(line)
    return "\n".join(out)


def remove_illustrative_note(content):
    return ILLUSTRATIVE_NOTE.sub("", content)


def remove_worked_example_section(content, skill_name):
    """
    Remove ## Worked Example sections.
    For code-reviewer: keep the Worked Example but fix self-attested Y and fake VERIFY.
    """
    if skill_name in KEEP_WORKED_EXAMPLE_SKILLS:
        # Fix self-attested Y rows in ground tables inside the worked example
        content = SELF_ATTESTED_Y.sub(
            lambda m: m.group(1) + " run the check command above " + m.group(2) + "\n",
            content,
        )
        # Remove fake VERIFY block with pasted output
        content = FAKE_VERIFY_BLOCK.sub(
            "### 5. VERIFY\n"
            "Emit one `VERIFY` block per changed behavior per [kernel/VERIFY.md](file:///Users/buiphucminhtam/GitHub/forgewright/kernel/VERIFY.md).\n",
            content,
        )
        # Fix header inside worked example ground table
        content = fix_ground_table(content)
        return content

    # For all others: remove the entire Worked Example section
    content = WORKED_EXAMPLE_SECTION.sub("", content)
    return content.rstrip() + "\n"


def remove_banned_paths(content):
    """
    Remove ground table rows that mention guaranteed-absent paths.
    """
    # .agents/workflows row
    lines = content.split("\n")
    out = []
    for line in lines:
        # Drop ground table rows mentioning .agents/workflows
        if (
            ".agents/workflows" in line
            and "|" in line
            and "Check command" not in line
            and "---|" not in line
        ):
            continue
        out.append(line)
    return "\n".join(out)


def strip_trailing_whitespace(content):
    lines = content.split("\n")
    return "\n".join(line.rstrip() for line in lines)


def has_banned_content(content):
    for pat, name in BANNED_PATTERNS:
        if pat.search(content):
            return True
    return False


def repair_file(filepath):
    skill = skill_name_from_path(filepath)

    with open(filepath, "r", encoding="utf-8") as f:
        original = f.read()

    content = original

    # 1. Fix ground table headers and Y/N columns
    content = fix_ground_table(content)

    # 2. Strip orphan citations
    content = strip_orphan_citations(content)

    # 3. Remove sync-obsidian SYNC steps
    content = remove_sync_step(content)

    # 4. Remove banned freetext (Temperature 1.0, ECE, etc.)
    content = remove_banned_freetext(content)

    # 5. Remove illustrative NOTE callouts
    content = remove_illustrative_note(content)

    # 6. Remove worked example (or fix in place for code-reviewer)
    content = remove_worked_example_section(content, skill)

    # 7. Remove banned paths from ground table rows
    content = remove_banned_paths(content)

    # 8. Strip trailing whitespace
    content = strip_trailing_whitespace(content)

    # 9. Ensure single trailing newline
    content = content.rstrip("\n") + "\n"

    changed = content != original

    if changed:
        if VERBOSE:
            print(f"  PATCHING: {filepath}")
        if not DRY_RUN:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)

    return changed


def main():
    if not os.path.isdir(SKILLS_DIR):
        print(f"Error: {SKILLS_DIR} directory not found.")
        sys.exit(1)

    changed_files = []
    total = 0

    for root, dirs, files in os.walk(SKILLS_DIR):
        for file in sorted(files):
            if file == "LITE.md":
                total += 1
                filepath = os.path.join(root, file)
                if repair_file(filepath):
                    changed_files.append(filepath)

    print("\n--- Repair Summary ---")
    print(f"Total overlays scanned: {total}")
    print(f"Files patched: {len(changed_files)}")
    if DRY_RUN:
        print("(DRY RUN — no files written)")
    for f in changed_files:
        print(f"  ✓ {f}")


if __name__ == "__main__":
    main()
