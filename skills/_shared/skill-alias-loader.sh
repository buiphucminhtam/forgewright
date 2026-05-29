#!/bin/bash
# skill-alias-loader.sh — Backward compatibility layer for deprecated skill names
# Part of Forgewright Phase 2.1 Skill Consolidation
# Created: 2026-05-29

set -euo pipefail

SKILL_NAME="${1:-}"
SKILLS_DIR="skills"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Alias mapping table
declare -A ALIASES=(
    # Web Engineering consolidation
    ["software-engineer"]="fullstack-engineer"
    ["frontend-engineer"]="fullstack-engineer"

    # Code Quality consolidation
    ["debugger"]="code-quality-engineer"
    ["code-reviewer"]="code-quality-engineer"
    ["qa-engineer"]="code-quality-engineer"
)

# Print warning message
warn_deprecated() {
    local old_name="$1"
    local new_name="$2"
    echo -e "${YELLOW}⚠️ WARNING: ${old_name} is deprecated${NC}" >&2
    echo -e "${YELLOW}   Please use: ${new_name}${NC}" >&2
    echo -e "${YELLOW}   This alias will be removed in v9.0.0${NC}" >&2
}

# Resolve skill name with alias lookup
resolve_skill() {
    local skill="$1"

    # Check if skill already exists as directory
    if [ -d "${SKILLS_DIR}/${skill}" ]; then
        echo "${skill}"
        return 0
    fi

    # Check if it's an alias
    if [ -n "${ALIASES[${skill}]:-}" ]; then
        local target="${ALIASES[${skill}]}"
        warn_deprecated "${skill}" "${target}"

        # Verify target exists
        if [ -d "${SKILLS_DIR}/${target}" ]; then
            echo "${target}"
            return 0
        else
            echo -e "${RED}❌ ERROR: Target skill not found: ${target}${NC}" >&2
            return 1
        fi
    fi

    # Skill not found
    echo -e "${RED}❌ ERROR: Skill not found: ${skill}${NC}" >&2
    echo -e "${RED}   Available skills:${NC}" >&2
    list_skills >&2
    return 1
}

# List all available skills (including aliases)
list_skills() {
    local skill_type="${1:-all}"

    echo "Available skills:"
    for skill_dir in "${SKILLS_DIR}"/*/; do
        local skill_name
        skill_name=$(basename "${skill_dir}")

        # Check if this is a deprecated alias
        local is_alias=""
        for alias in "${!ALIASES[@]}"; do
            if [ "${ALIASES[${alias}]}" = "${skill_name}" ]; then
                is_alias=" (alias: ${alias})"
                break
            fi
        done

        echo "  - ${skill_name}${is_alias}"
    done | sort
}

# List only aliases (deprecated skills)
list_aliases() {
    echo "Deprecated skills (use aliases to redirect):"
    for alias in "${!ALIASES[@]}"; do
        echo "  - ${alias} → ${ALIASES[${alias}]}"
    done | sort
}

# Show help
show_help() {
    cat << 'EOF'
skill-alias-loader.sh — Backward compatibility layer for deprecated skill names

USAGE:
    skill-alias-loader.sh <skill-name>         Resolve skill with alias lookup
    skill-alias-loader.sh --list              List all available skills
    skill-alias-loader.sh --aliases           List deprecated aliases
    skill-alias-loader.sh --help              Show this help

EXAMPLES:
    # Resolve a potentially deprecated skill
    skill-alias-loader.sh software-engineer

    # List all available skills
    skill-alias-loader.sh --list

    # List deprecated aliases
    skill-alias-loader.sh --aliases

EXIT CODES:
    0 - Success
    1 - Skill not found

EOF
}

# Main execution
case "${SKILL_NAME:-}" in
    "")
        show_help
        exit 0
        ;;
    "--list"|"-l")
        list_skills
        exit 0
        ;;
    "--aliases"|"-a")
        list_aliases
        exit 0
        ;;
    "--help"|"-h")
        show_help
        exit 0
        ;;
    *)
        resolve_skill "${SKILL_NAME}"
        ;;
esac
