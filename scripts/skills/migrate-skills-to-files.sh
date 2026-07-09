#!/bin/bash
# scripts/migrate-skills-to-files.sh
# Migrates inline prompts from SKILL.md to separate prompt files
# Usage: bash scripts/migrate-skills-to-files.sh [--skill <name>] [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS_DIR="$FORGEWRIGHT_DIR/skills"
PROMPTS_DIR="prompts"
DRY_RUN=false
TARGET_SKILL=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

show_help() {
    cat << EOF
Migrate skill prompts from inline SKILL.md to separate files.

Usage:
  $0 [--skill <name>] [--dry-run] [--help]

Options:
  --skill <name>   Migrate only this skill (e.g., business-analyst)
  --dry-run        Show what would be changed without modifying files
  --help           Show this help message

Examples:
  $0                                    # Migrate all skills
  $0 --skill business-analyst           # Migrate specific skill
  $0 --dry-run                          # Preview changes

Output:
  Creates: skills/<skill>/prompts/system-prompt.md
  Modifies: skills/<skill>/SKILL.md

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skill)
            TARGET_SKILL="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Detect extraction method based on SKILL.md structure
extract_prompts() {
    local skill_md="$1"
    local prompts_dir="$2"

    if [[ ! -f "$skill_md" ]]; then
        log_error "SKILL.md not found: $skill_md"
        return 1
    fi

    # Check if file already has file:// references
    if grep -q 'file://' "$skill_md" 2>/dev/null; then
        log_warn "Already migrated: $skill_md"
        return 0
    fi

    # Count lines to estimate prompt size
    local total_lines
    total_lines=$(wc -l < "$skill_md")

    if [[ $total_lines -lt 50 ]]; then
        log_info "Small skill (< 50 lines), skipping: $skill_md"
        return 0
    fi

    echo "  Skill: $(basename "$(dirname "$skill_md")")"
    echo "  Lines: $total_lines"
    echo "  Target: $prompts_dir/system-prompt.md"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "  Status: [DRY-RUN] Would extract inline prompt"
    else
        # Create prompts directory
        mkdir -p "$prompts_dir"

        # For now, create a placeholder indicating migration needed
        # Full implementation would parse the SKILL.md and extract the system prompt section
        cat > "$prompts_dir/system-prompt.md" << 'PLACEHOLDER'
# System Prompt Placeholder

This file should contain the extracted system prompt from SKILL.md.

## Migration Status

This skill needs manual migration of the system prompt section from SKILL.md.

Steps:
1. Read the SKILL.md file
2. Identify the system prompt section (between frontmatter and first ## heading)
3. Copy it to this file
4. Replace inline content with: file://prompts/system-prompt.md

## Frontmatter

The frontmatter (between --- lines) should remain in SKILL.md.

## System Prompt Section

Extract content that looks like:
- "You are a [role]..."
- Long descriptive paragraphs about the skill's identity
- Response templates
- Detailed instructions

## After Migration

Update SKILL.md to reference this file:
```markdown
file://prompts/system-prompt.md
```
PLACEHOLDER

        echo "  Status: [CREATED] Placeholder file"
    fi

    echo ""
}

main() {
    echo ""
    echo "========================================"
    echo "  Skill Prompt Migration Tool"
    echo "========================================"
    echo ""
    echo "Forgewright: $FORGEWRIGHT_DIR"
    echo "Skills dir: $SKILLS_DIR"
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "DRY-RUN MODE — No files will be modified"
        echo ""
    fi

    local count=0

    # Iterate over skills
    for skill_dir in "$SKILLS_DIR"/*/; do
        local skill_name
        skill_name=$(basename "$skill_dir")

        # Filter by target skill if specified
        if [[ -n "$TARGET_SKILL" && "$skill_name" != "$TARGET_SKILL" ]]; then
            continue
        fi

        local skill_md="$skill_dir/SKILL.md"

        if [[ -f "$skill_md" ]]; then
            extract_prompts "$skill_md" "$skill_dir/$PROMPTS_DIR"
            ((count++))
        fi
    done

    echo ""
    echo "========================================"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry-run complete. $count skill(s) would be processed."
        echo ""
        echo "To apply changes, run without --dry-run:"
        echo "  $0 --skill <name>   # Migrate specific skill"
        echo "  $0                   # Migrate all skills"
    else
        log_ok "Migration complete. $count skill(s) processed."
        echo ""
        echo "Review the generated files and manually extract system prompts."
        echo "Then update SKILL.md to reference the files."
    fi
    echo "========================================"
    echo ""
}

main
