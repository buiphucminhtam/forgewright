#!/bin/bash
# skill-rollback.sh — Rollback skill to a previous version
# Part of Forgewright Phase 2.3 Skill Versioning
# Created: 2026-05-29

set -euo pipefail

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SKILL_NAME="${1:-}"
TARGET_VERSION="${2:-previous}"
SKILLS_DIR="skills"
BACKUP_DIR=".forgewright/backups/skills"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Print colored output
print_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
print_success() { echo -e "${GREEN}✅ $*${NC}"; }
print_warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
print_error() { echo -e "${RED}❌ $*${NC}" >&2; }

# Show help
show_help() {
    cat << 'EOF'
skill-rollback.sh — Rollback skill to a previous version

USAGE:
    skill-rollback.sh <skill-name> [version]
    skill-rollback.sh --list <skill-name>
    skill-rollback.sh --help

ARGUMENTS:
    skill-name       Name of the skill to rollback
    version          Target version (default: previous)

OPTIONS:
    --list          List available versions for a skill
    --help          Show this help message

EXAMPLES:
    # Rollback to previous version
    skill-rollback.sh software-engineer

    # Rollback to specific version
    skill-rollback.sh software-engineer 2.2.0

    # List available versions
    skill-rollback.sh --list software-engineer

EXIT CODES:
    0   Success
    1   Skill not found or backup not found
    2   Invalid arguments

EOF
}

# List available versions
list_versions() {
    local skill="$1"
    local backup_path="${BACKUP_DIR}/${skill}"

    if [ ! -d "$backup_path" ]; then
        print_error "No backups found for skill: ${skill}"
        print_info "Run 'skill-backup.sh ${skill}' first to create a backup"
        return 1
    fi

    echo "Available versions for '${skill}':"
    echo ""

    local versions
    versions=$(ls -1 "$backup_path" 2>/dev/null | sort -V || true)

    if [ -z "$versions" ]; then
        print_error "No backup versions found"
        return 1
    fi

    for version in $versions; do
        local version_path="${backup_path}/${version}"
        local date_info=""
        if [ -f "${version_path}/VERSION" ]; then
            date_info=$(grep '^released:' "${version_path}/VERSION" 2>/dev/null | cut -d'"' -f2 || echo "")
        fi
        if [ -n "$date_info" ]; then
            echo "  - ${version} (${date_info})"
        else
            echo "  - ${version}"
        fi
    done

    echo ""
    print_info "Current version: $(cat "${SKILLS_DIR}/${skill}/VERSION" 2>/dev/null | grep '^version:' | cut -d'"' -f2 || 'unknown')"
}

# Perform rollback
rollback_skill() {
    local skill="$1"
    local version="$2"

    local backup_path="${BACKUP_DIR}/${skill}"

    # Validate skill exists
    if [ ! -d "${SKILLS_DIR}/${skill}" ]; then
        print_error "Skill not found: ${skill}"
        return 1
    fi

    # Find available versions
    if [ ! -d "$backup_path" ]; then
        print_error "No backups found for skill: ${skill}"
        print_info "Run 'skill-backup.sh ${skill}' first to create a backup"
        return 1
    fi

    local versions
    versions=$(ls -1 "$backup_path" 2>/dev/null | sort -V || true)

    if [ -z "$versions" ]; then
        print_error "No backup versions available"
        return 1
    fi

    # Determine target version
    local target=""
    if [ "$version" = "previous" ]; then
        # Get the second-to-last version (skip current state if it's there)
        local sorted_versions
        sorted_versions=$(echo "$versions" | sort -V)
        target=$(echo "$sorted_versions" | head -n -1 | tail -n 1)

        if [ -z "$target" ]; then
            # Only one backup, use it
            target=$(echo "$versions" | head -n 1)
        fi
    else
        target="$version"
    fi

    # Verify target exists
    if [ ! -d "${backup_path}/${target}" ]; then
        print_error "Version not found: ${target}"
        echo ""
        print_info "Available versions:"
        list_versions "$skill"
        return 1
    fi

    # Create pre-rollback backup of current state
    print_info "Creating pre-rollback backup..."
    local pre_backup="${BACKUP_DIR}/${skill}_pre_rollback_${TIMESTAMP}"
    mkdir -p "$pre_backup"
    cp -r "${SKILLS_DIR}/${skill}/"* "$pre_backup/" 2>/dev/null || true
    print_success "Pre-rollback backup created: ${pre_backup}"

    # Restore target version
    print_info "Rolling back ${skill} to version ${target}..."
    rm -rf "${SKILLS_DIR}/${skill}"/*
    cp -r "${backup_path}/${target}/"* "${SKILLS_DIR}/${skill}/"
    print_success "Rolled back ${skill} to ${target}"

    echo ""
    print_success "Rollback complete!"
    print_info "Pre-rollback backup location: ${pre_backup}"
    print_info "Run tests to verify the rollback: bash scripts/skill-health.sh ${skill}"
}

# Validate arguments
if [ -z "$SKILL_NAME" ]; then
    if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
        show_help
        exit 0
    fi
    print_error "Skill name required"
    echo ""
    show_help
    exit 2
fi

# Handle options
if [ "$SKILL_NAME" = "--list" ]; then
    if [ -z "${2:-}" ]; then
        print_error "Skill name required for --list"
        exit 2
    fi
    list_versions "$2"
elif [ "$SKILL_NAME" = "--help" ] || [ "$SKILL_NAME" = "-h" ]; then
    show_help
elif [ "$SKILL_NAME" = "--versions" ]; then
    # Alias for --list
    if [ -z "${2:-}" ]; then
        print_error "Skill name required"
        exit 2
    fi
    list_versions "$2"
else
    rollback_skill "$SKILL_NAME" "$TARGET_VERSION"
fi
