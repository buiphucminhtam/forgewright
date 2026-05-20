#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# fw-migrate-global — Migrate Existing Projects to Global Setup
#
# Migrates projects from per-project setup to global setup.
# Removes .antigravity/mcp-manifest.json and .forgewright/mcp-server/
# from each project, moving to global configuration.
#
# USAGE:
#   fw-migrate-global.sh --dry-run               # Preview changes
#   fw-migrate-global.sh                         # Interactive migration
#   fw-migrate-global.sh --all                  # Migrate all projects
#   fw-migrate-global.sh /path/to/project        # Migrate specific project
#   fw-migrate-global.sh --rollback              # Rollback last migration
#
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}  ➜${NC} $1"; }
log_ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
log_error() { echo -e "${RED}  ✗${NC} $1"; }
log_info()  { echo -e "  $1"; }

# ─── Paths ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
GLOBAL_CONFIG_DIR="${HOME}/.config/forgewright"
BACKUP_DIR="${HOME}/.config/forgewright/migrations"
MIGRATION_LOG="${BACKUP_DIR}/migration-log.json"

# ─── Help ─────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
fw-migrate-global — Migrate to Global Forgewright MCP Setup

SYNOPSIS
    fw-migrate-global.sh [OPTIONS] [project_path]

DESCRIPTION
    Migrates existing projects from per-project setup to global setup.
    Removes .antigravity/mcp-manifest.json and .forgewright/mcp-server/
    from projects, using global configuration instead.

OPTIONS
    --dry-run          Preview changes without applying them
    --all              Migrate all projects in registry
    --scan             Scan for projects needing migration
    --rollback         Rollback the last migration
    --force            Skip confirmation prompts
    --help, -h        Show this help

ARGUMENTS
    project_path       Specific project to migrate (default: current directory)

EXAMPLES
    # Preview migration for current project
    fw-migrate-global.sh --dry-run

    # Migrate all registered projects
    fw-migrate-global.sh --all

    # Migrate specific project
    fw-migrate-global.sh /path/to/project

    # Rollback last migration
    fw-migrate-global.sh --rollback

WHAT GETS REMOVED (per project)
    .antigravity/mcp-manifest.json
    .forgewright/mcp-server/
    .forgewright/mcp-server

WHAT GETS PRESERVED
    .forgewright/settings.env (project-specific settings)
    .forgewright/project-profile.json (project intelligence)
    .forgewright/code-conventions.md (code patterns)
    .antigravity/ (other directories)

EOF
}

# ─── Logging ────────────────────────────────────────────────────────────────

init_migration_log() {
    mkdir -p "$BACKUP_DIR"
    
    if [[ ! -f "$MIGRATION_LOG" ]]; then
        echo '{"migrations":[]}' > "$MIGRATION_LOG"
    fi
}

log_migration() {
    local project="$1"
    local action="$2"
    local files="$3"
    
    node -e "
var fs = require('fs');
try {
    var log = JSON.parse(fs.readFileSync('${MIGRATION_LOG}', 'utf8'));
    log.migrations.push({
        project: '${project}',
        action: '${action}',
        files: '${files}'.split(',').filter(Boolean),
        timestamp: new Date().toISOString()
    });
    fs.writeFileSync('${MIGRATION_LOG}', JSON.stringify(log, null, 2));
} catch(e) {}
"
}

get_last_migration() {
    node -e "
var fs = require('fs');
try {
    var log = JSON.parse(fs.readFileSync('${MIGRATION_LOG}', 'utf8'));
    var migrations = log.migrations || [];
    if (migrations.length > 0) {
        var last = migrations[migrations.length - 1];
        console.log(JSON.stringify(last));
    }
} catch(e) {}
" 2>/dev/null
}

# ─── Scan for Projects Needing Migration ────────────────────────────────────

scan_projects() {
    echo ""
    echo -e "${CYAN}━━━ Scanning for Projects Needing Migration ━━━${NC}"
    echo ""
    
    local found=()
    
    # Scan from common locations
    local search_roots=(
        "${HOME}/GitHub"
        "${HOME}/Documents/GitHub"
        "${HOME}/Projects"
        "${HOME}/workspace"
    )
    
    for root in "${search_roots[@]}"; do
        if [[ -d "$root" ]]; then
            while IFS= read -r project; do
                if [[ -n "$project" ]] && [[ -d "$project" ]]; then
                    # Check if needs migration
                    if [[ -f "$project/.antigravity/mcp-manifest.json" ]] || \
                       [[ -d "$project/.forgewright/mcp-server" ]]; then
                        found+=("$project")
                    fi
                fi
            done < <(find "$root" -maxdepth 3 -type d -name '.antigravity' 2>/dev/null | xargs -I{} dirname {})
        fi
    done
    
    # Also check registry
    local registry="${HOME}/.config/forgewright/registry.json"
    if [[ -f "$registry" ]]; then
        while IFS= read -r project; do
            if [[ -n "$project" ]] && [[ -d "$project" ]]; then
                if [[ -f "$project/.antigravity/mcp-manifest.json" ]] || \
                   [[ -d "$project/.forgewright/mcp-server" ]]; then
                    # Check if already in found
                    local already_found=false
                    for f in "${found[@]}"; do
                        if [[ "$f" == "$project" ]]; then
                            already_found=true
                            break
                        fi
                    done
                    if [[ "$already_found" == "false" ]]; then
                        found+=("$project")
                    fi
                fi
            fi
        done < <(node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${registry}', 'utf8'));
    Object.keys(reg.projects || {}).forEach(function(p) { console.log(p); });
} catch(e) {}
")
    fi
    
    if [[ ${#found[@]} -eq 0 ]]; then
        log_ok "No projects need migration"
        log_info ""
        log_info "Projects are already using global setup or don't have MCP configured"
        return 0
    fi
    
    echo -e "  Found ${#found[@]} project(s) needing migration:"
    echo ""
    
    for project in "${found[@]}"; do
        local name
        name="$(basename "$project")"
        
        echo -e "  ${MAGENTA}${name}${NC}"
        echo "    $project"
        
        # Show what will be removed
        if [[ -f "$project/.antigravity/mcp-manifest.json" ]]; then
            echo "    - .antigravity/mcp-manifest.json"
        fi
        if [[ -d "$project/.forgewright/mcp-server" ]]; then
            echo "    - .forgewright/mcp-server/"
        fi
        echo ""
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  To migrate: bash scripts/fw-migrate-global.sh --all"
    echo ""
}

# ─── Analyze Project ────────────────────────────────────────────────────────

analyze_project() {
    local project="$1"
    
    echo ""
    echo -e "${CYAN}━━━ Project Analysis: $(basename "$project") ━━━${NC}"
    echo ""
    echo "  Path: $project"
    echo ""
    
    local needs_migration=false
    
    # Check for files that need migration
    if [[ -f "$project/.antigravity/mcp-manifest.json" ]]; then
        log_step "Found: .antigravity/mcp-manifest.json"
        needs_migration=true
        
        # Show content summary
        local workspace
        workspace=$(node -e "
var fs = require('fs');
try {
    var m = JSON.parse(fs.readFileSync('${project}/.antigravity/mcp-manifest.json', 'utf8'));
    console.log(m.workspace || 'unknown');
} catch(e) { console.log('unknown'); }
" 2>/dev/null)
        log_info "  Workspace: $workspace"
    fi
    
    if [[ -d "$project/.forgewright/mcp-server" ]]; then
        log_step "Found: .forgewright/mcp-server/"
        needs_migration=true
        
        local size
        size=$(du -sh "$project/.forgewright/mcp-server" 2>/dev/null | cut -f1)
        log_info "  Size: $size"
    fi
    
    # Check what's preserved
    echo ""
    log_info "Preserved (project-specific):"
    
    if [[ -f "$project/.forgewright/settings.env" ]]; then
        log_ok "  - .forgewright/settings.env"
    fi
    if [[ -f "$project/.forgewright/project-profile.json" ]]; then
        log_ok "  - .forgewright/project-profile.json"
    fi
    if [[ -f "$project/.forgewright/code-conventions.md" ]]; then
        log_ok "  - .forgewright/code-conventions.md"
    fi
    
    # Check .antigravity/ subdirs
    if [[ -d "$project/.antigravity" ]]; then
        local subdirs
        subdirs=$(find "$project/.antigravity" -maxdepth 1 -type d ! -name '.antigravity' 2>/dev/null | wc -l)
        if [[ "$subdirs" -gt 0 ]]; then
            log_ok "  - .antigravity/ (${subdirs} other subdirectory/ies)"
        fi
    fi
    
    echo ""
    
    if [[ "$needs_migration" == "true" ]]; then
        echo -e "  ${GREEN}✓ Needs migration${NC}"
    else
        echo -e "  ${YELLOW}⚠ No migration needed${NC}"
    fi
    
    echo ""
}

# ─── Migrate Project ─────────────────────────────────────────────────────────

migrate_project() {
    local project="$1"
    local dry_run="${2:-false}"
    local force="${3:-false}"
    
    # Analyze first
    analyze_project "$project"
    
    # Check if migration needed
    if [[ ! -f "$project/.antigravity/mcp-manifest.json" ]] && \
       [[ ! -d "$project/.forgewright/mcp-server" ]]; then
        log_info "No migration needed for this project"
        return 0
    fi
    
    echo ""
    
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${CYAN}DRY RUN - No changes will be made${NC}"
        echo ""
        log_info "To apply migration, run without --dry-run"
        return 0
    fi
    
    # Confirm
    if [[ "$force" != "true" ]]; then
        echo -e -n "${YELLOW}Proceed with migration? [y/N] ${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Migration cancelled"
            return 0
        fi
    fi
    
    echo ""
    log_step "Migrating project..."
    echo ""
    
    local migrated_files=()
    
    # Backup and remove .antigravity/mcp-manifest.json
    if [[ -f "$project/.antigravity/mcp-manifest.json" ]]; then
        local backup="${BACKUP_DIR}/$(basename "$project")-antigravity-mcp-manifest.json"
        mkdir -p "$BACKUP_DIR"
        cp "$project/.antigravity/mcp-manifest.json" "$backup"
        rm "$project/.antigravity/mcp-manifest.json"
        log_ok "Removed: .antigravity/mcp-manifest.json"
        log_info "  Backed up to: $backup"
        migrated_files+=("antigravity-mcp-manifest.json")
    fi
    
    # Backup and remove .forgewright/mcp-server/
    if [[ -d "$project/.forgewright/mcp-server" ]]; then
        local backup="${BACKUP_DIR}/$(basename "$project")-forgewright-mcp-server.tar.gz"
        mkdir -p "$BACKUP_DIR"
        tar -czf "$backup" -C "$project/.forgewright" mcp-server 2>/dev/null || {
            # Fallback if tar fails
            cp -r "$project/.forgewright/mcp-server" "${BACKUP_DIR}/$(basename "$project")-mcp-server"
        }
        rm -rf "$project/.forgewright/mcp-server"
        log_ok "Removed: .forgewright/mcp-server/"
        log_info "  Backed up to: $backup"
        migrated_files+=("forgewright-mcp-server")
    fi
    
    # Log migration
    log_migration "$project" "migrate" "${migrated_files[*]}"
    
    echo ""
    log_ok "Migration complete for: $project"
    echo ""
    
    # Check if .antigravity/ is now empty
    if [[ -d "$project/.antigravity" ]]; then
        local remaining
        remaining=$(find "$project/.antigravity" -maxdepth 1 -type f -o -type d ! -name '.antigravity' 2>/dev/null | wc -l)
        if [[ "$remaining" -eq 0 ]]; then
            log_info "Note: .antigravity/ is now empty"
            log_info "  You may remove it if desired"
        fi
    fi
}

# ─── Migrate All ────────────────────────────────────────────────────────────

migrate_all() {
    local dry_run="${1:-false}"
    local force="${2:-false}"
    
    echo ""
    echo -e "${CYAN}━━━ Migrating All Projects ━━━${NC}"
    echo ""
    
    init_migration_log
    
    local found=()
    
    # Scan from registry
    local registry="${HOME}/.config/forgewright/registry.json"
    if [[ -f "$registry" ]]; then
        while IFS= read -r project; do
            if [[ -n "$project" ]] && [[ -d "$project" ]]; then
                if [[ -f "$project/.antigravity/mcp-manifest.json" ]] || \
                   [[ -d "$project/.forgewright/mcp-server" ]]; then
                    found+=("$project")
                fi
            fi
        done < <(node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${registry}', 'utf8'));
    Object.keys(reg.projects || {}).forEach(function(p) { console.log(p); });
} catch(e) {}
")
    fi
    
    # Also scan directories
    local search_roots=(
        "${HOME}/GitHub"
        "${HOME}/Documents/GitHub"
        "${HOME}/Projects"
        "${HOME}/workspace"
    )
    
    for root in "${search_roots[@]}"; do
        if [[ -d "$root" ]]; then
            while IFS= read -r project; do
                if [[ -n "$project" ]] && [[ -d "$project" ]]; then
                    if [[ -f "$project/.antigravity/mcp-manifest.json" ]] || \
                       [[ -d "$project/.forgewright/mcp-server" ]]; then
                        # Check if already in found
                        local already_found=false
                        for f in "${found[@]}"; do
                            if [[ "$f" == "$project" ]]; then
                                already_found=true
                                break
                            fi
                        done
                        if [[ "$already_found" == "false" ]]; then
                            found+=("$project")
                        fi
                    fi
                fi
            done < <(find "$root" -maxdepth 3 -type d -name '.antigravity' 2>/dev/null | xargs -I{} dirname {})
        fi
    done
    
    if [[ ${#found[@]} -eq 0 ]]; then
        log_ok "No projects need migration"
        return 0
    fi
    
    echo "  Found ${#found[@]} project(s)"
    echo ""
    
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${CYAN}DRY RUN - No changes will be made${NC}"
        echo ""
    fi
    
    local migrated=0
    local skipped=0
    
    for project in "${found[@]}"; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo -e "  ${MAGENTA}$(basename "$project")${NC}"
        echo "  $project"
        echo ""
        
        if [[ "$dry_run" == "true" ]]; then
            analyze_project "$project"
            ((skipped++))
        else
            migrate_project "$project" "false" "$force"
            ((migrated++))
        fi
    done
    
    echo ""
    echo "━━━ Summary ━━━"
    echo ""
    
    if [[ "$dry_run" == "true" ]]; then
        log_info "Projects found: ${#found[@]}"
        log_info "Run without --dry-run to migrate"
    else
        log_ok "Migrated: $migrated project(s)"
        log_info "Skipped: $skipped project(s)"
        echo ""
        echo -e "${GREEN}✓ Global migration complete${NC}"
        echo ""
        echo "  Restart your IDEs to apply changes."
    fi
}

# ─── Rollback ────────────────────────────────────────────────────────────────

rollback_migration() {
    echo ""
    echo -e "${CYAN}━━━ Rollback Last Migration ━━━${NC}"
    echo ""
    
    init_migration_log
    
    local last_migration
    last_migration=$(get_last_migration)
    
    if [[ -z "$last_migration" ]]; then
        log_warn "No migration to rollback"
        return 0
    fi
    
    echo "Last migration:"
    echo "$last_migration" | node -e "
var stdin = '';
process.stdin.on('data', d => stdin += d);
process.stdin.on('end', () => {
    try {
        var m = JSON.parse(stdin);
        console.log('  Project: ' + m.project);
        console.log('  Files:   ' + (m.files || []).join(', '));
        console.log('  Time:    ' + m.timestamp);
    } catch(e) {}
});
"
    echo ""
    
    # Confirm
    echo -e -n "${YELLOW}Rollback this migration? [y/N] ${NC}"
    read -r response
    
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Rollback cancelled"
        return 0
    fi
    
    # Restore files from backups
    local project
    project=$(echo "$last_migration" | node -e "
var stdin = '';
process.stdin.on('data', d => stdin += d);
process.stdin.on('end', () => {
    try {
        var m = JSON.parse(stdin);
        console.log(m.project);
    } catch(e) {}
});
")
    
    local project_name
    project_name="$(basename "$project")"
    
    # Restore each file
    for file in "${last_migration//\"/}"/*; do
        if [[ -f "$file" ]]; then
            :
        fi
    done
    
    # Restore from backup
    if [[ -f "${BACKUP_DIR}/${project_name}-antigravity-mcp-manifest.json" ]]; then
        mkdir -p "$project/.antigravity"
        cp "${BACKUP_DIR}/${project_name}-antigravity-mcp-manifest.json" \
           "$project/.antigravity/mcp-manifest.json"
        log_ok "Restored: .antigravity/mcp-manifest.json"
    fi
    
    # Restore mcp-server
    if [[ -f "${BACKUP_DIR}/${project_name}-forgewright-mcp-server.tar.gz" ]]; then
        tar -xzf "${BACKUP_DIR}/${project_name}-forgewright-mcp-server.tar.gz" \
                 -C "$project/.forgewright" 2>/dev/null || {
            # Fallback if tar fails
            if [[ -d "${BACKUP_DIR}/${project_name}-mcp-server" ]]; then
                cp -r "${BACKUP_DIR}/${project_name}-mcp-server" \
                      "$project/.forgewright/mcp-server"
            fi
        }
        log_ok "Restored: .forgewright/mcp-server/"
    fi
    
    # Mark as rolled back in log
    node -e "
var fs = require('fs');
try {
    var log = JSON.parse(fs.readFileSync('${MIGRATION_LOG}', 'utf8'));
    var migrations = log.migrations || [];
    if (migrations.length > 0) {
        migrations[migrations.length - 1].rolled_back = true;
        fs.writeFileSync('${MIGRATION_LOG}', JSON.stringify(log, null, 2));
    }
} catch(e) {}
"
    
    echo ""
    log_ok "Rollback complete"
    echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────

main() {
    local mode="single"
    local dry_run=false
    local force=false
    local project=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)   dry_run=true; shift ;;
            --all)       mode="all"; shift ;;
            --scan)      mode="scan"; shift ;;
            --rollback)  mode="rollback"; shift ;;
            --force)     force=true; shift ;;
            --help|-h)   show_help; exit 0 ;;
            -*)          shift ;;
            *)           project="$1"; shift ;;
        esac
    done
    
    echo ""
    echo -e "${CYAN}⚡ Forgewright Global Migration Tool${NC}"
    echo ""
    
    init_migration_log
    
    case "$mode" in
        scan)
            scan_projects
            ;;
        all)
            migrate_all "$dry_run" "$force"
            ;;
        rollback)
            rollback_migration
            ;;
        single)
            if [[ -z "$project" ]]; then
                project="$(pwd)"
            fi
            
            if [[ ! -d "$project" ]]; then
                log_error "Not a directory: $project"
                exit 1
            fi
            
            migrate_project "$project" "$dry_run" "$force"
            
            if [[ "$dry_run" != "true" ]]; then
                echo ""
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo -e " ${GREEN}✓ Migration complete${NC}"
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo ""
                echo "  Restart your IDEs to apply changes."
                echo ""
            fi
            ;;
    esac
}

main "$@"
