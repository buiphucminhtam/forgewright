#!/bin/bash
# skill-backup.sh — Automated backup before skill changes
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
SKILLS_DIR="skills"
BACKUP_DIR=".forgewright/backups/skills"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Print colored output
print_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
print_success() { echo -e "${GREEN}✅ $*${NC}"; }
print_warn() { echo -e "${YELLOW}⚠️  $*${NC}" >&2; }
print_error() { echo -e "${RED}❌ $*${NC}" >&2; }

# Show help
show_help() {
    cat << 'EOF'
skill-backup.sh — Automated backup before skill changes

USAGE:
    skill-backup.sh <skill-name> [--verify]
    skill-backup.sh --list [skill-name]
    skill-backup.sh --help

ARGUMENTS:
    skill-name       Name of the skill to backup

OPTIONS:
    --verify         Verify backup integrity
    --list           List all backups
    --list <skill>   List backups for a specific skill
    --help           Show this help message

EXAMPLES:
    # Create a backup
    skill-backup.sh software-engineer

    # List all backups
    skill-backup.sh --list

    # List backups for a skill
    skill-backup.sh --list software-engineer

    # Verify backup integrity
    skill-backup.sh software-engineer --verify

EXIT CODES:
    0   Success
    1   Skill not found or backup failed
    2   Invalid arguments

EOF
}

# Create backup
backup_skill() {
    local skill="$1"

    # Validate skill exists
    if [ ! -d "${SKILLS_DIR}/${skill}" ]; then
        print_error "Skill not found: ${skill}"
        print_info "Available skills:"
        ls -1 "${SKILLS_DIR}" | sed 's/^/  - /'
        return 1
    fi

    # Get current version
    local current_version="unknown"
    if [ -f "${SKILLS_DIR}/${skill}/VERSION" ]; then
        current_version=$(grep '^version:' "${SKILLS_DIR}/${skill}/VERSION" 2>/dev/null | cut -d'"' -f2 || echo "unknown")
    fi

    # Create backup directory
    local backup_path="${BACKUP_DIR}/${skill}/${current_version}"
    mkdir -p "$backup_path"

    # Copy skill files
    print_info "Backing up ${skill} (v${current_version})..."
    cp -r "${SKILLS_DIR}/${skill}/"* "$backup_path/"

    print_success "Backup created: ${backup_path}"

    # List backup
    echo ""
    print_info "Backup contents:"
    ls -1 "$backup_path" | sed 's/^/  - /'

    echo ""
    print_success "Backup complete!"
    print_info "Current version: ${current_version}"
    print_info "To rollback: bash scripts/skill-rollback.sh ${skill}"
}

# Verify backup
verify_backup() {
    local skill="$1"

    # Validate skill exists
    if [ ! -d "${SKILLS_DIR}/${skill}" ]; then
        print_error "Skill not found: ${skill}"
        return 1
    fi

    # Find latest backup
    local backup_path="${BACKUP_DIR}/${skill}"
    if [ ! -d "$backup_path" ]; then
        print_error "No backups found for ${skill}"
        return 1
    fi

    local latest_version
    latest_version=$(ls -1 "$backup_path" 2>/dev/null | sort -V | tail -n 1 || true)

    if [ -z "$latest_version" ]; then
        print_error "No backup versions found"
        return 1
    fi

    local latest_backup="${backup_path}/${latest_version}"

    print_info "Verifying latest backup for ${skill} (${latest_version})..."
    echo ""

    # Check required files
    local required_files=("SKILL.md" "VERSION")
    local all_present=true

    for file in "${required_files[@]}"; do
        if [ -f "${latest_backup}/${file}" ]; then
            print_success "✓ ${file} present"
        else
            print_error "✗ ${file} missing"
            all_present=false
        fi
    done

    echo ""

    # Verify VERSION file
    if [ -f "${latest_backup}/VERSION" ]; then
        print_info "VERSION file content:"
        cat "${latest_backup}/VERSION" | sed 's/^/  /'
        echo ""
    fi

    # Compare with current
    if [ -f "${SKILLS_DIR}/${skill}/SKILL.md" ] && [ -f "${latest_backup}/SKILL.md" ]; then
        local diff_count
        diff_count=$(diff "${SKILLS_DIR}/${skill}/SKILL.md" "${latest_backup}/SKILL.md" 2>/dev/null | wc -l || echo "0")

        if [ "$diff_count" -eq 0 ]; then
            print_info "SKILL.md matches current state (backup is current)"
        else
            print_info "SKILL.md differs from current state (backup is older)"
        fi
    fi

    if [ "$all_present" = true ]; then
        print_success "Backup verification passed!"
        return 0
    else
        print_error "Backup verification failed!"
        return 1
    fi
}

# List backups
list_backups() {
    local skill="${1:-}"

    if [ -n "$skill" ]; then
        # List backups for specific skill
        local backup_path="${BACKUP_DIR}/${skill}"
        if [ ! -d "$backup_path" ]; then
            print_error "No backups found for ${skill}"
            return 1
        fi

        echo "Backups for '${skill}':"
        echo ""
        ls -1 "$backup_path" | while read -r version; do
            local backup="${backup_path}/${version}"
            local file_count
            file_count=$(ls -1 "$backup" 2>/dev/null | wc -l || echo "0")
            echo "  - ${version} (${file_count} files)"
        done
    else
        # List all backups
        if [ ! -d "$BACKUP_DIR" ]; then
            print_info "No backups found yet"
            return 0
        fi

        echo "All skill backups:"
        echo ""

        local total_backups=0
        ls -1 "$BACKUP_DIR" 2>/dev/null | while read -r skill_dir; do
            local skill_path="${BACKUP_DIR}/${skill_dir}"
            if [ -d "$skill_path" ]; then
                local version_count
                version_count=$(ls -1 "$skill_path" 2>/dev/null | wc -l || echo "0")
                echo "  ${skill_dir}: ${version_count} backup(s)"
                total_backups=$((total_backups + version_count))
            fi
        done

        echo ""
        print_info "Total: ${total_backups} backup(s)"
    fi
}

# Parse arguments
if [ -z "$SKILL_NAME" ]; then
    if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
        show_help
        exit 0
    fi
    if [ "${1:-}" = "--list" ]; then
        list_backups "${2:-}"
        exit 0
    fi
    print_error "Skill name required"
    echo ""
    show_help
    exit 2
fi

if [ "$SKILL_NAME" = "--help" ] || [ "$SKILL_NAME" = "-h" ]; then
    show_help
elif [ "$SKILL_NAME" = "--list" ]; then
    list_backups "${2:-}"
elif [ "$2" = "--verify" ] || [ "$2" = "-v" ]; then
    verify_backup "$SKILL_NAME"
else
    backup_skill "$SKILL_NAME"
fi
