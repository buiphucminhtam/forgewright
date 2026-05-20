#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# fw-global-registry — Project Registry CLI for Forgewright
#
# Manages the central project registry for global MCP setup.
# Tracks which projects have been set up with Forgewright.
#
# USAGE:
#   fw-global-registry.sh list                    # List all registered projects
#   fw-global-registry.sh add [path]             # Register a project
#   fw-global-registry.sh remove [path]          # Unregister a project
#   fw-global-registry.sh check [path]           # Check if project is registered
#   fw-global-registry.sh update [path]          # Update project info
#   fw-global-registry.sh clean                   # Remove stale entries
#   fw-global-registry.sh export [file]           # Export registry
#   fw-global-registry.sh import [file]           # Import registry
#
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}  ➜${NC} $1"; }
log_ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
log_error() { echo -e "${RED}  ✗${NC} $1"; }
log_info()  { echo -e "  $1"; }

# ─── Paths ─────────────────────────────────────────────────────────────────

GLOBAL_CONFIG_DIR="${HOME}/.config/forgewright"
GLOBAL_REGISTRY="${GLOBAL_CONFIG_DIR}/registry.json"

# ─── Help ─────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
fw-global-registry — Project Registry CLI for Forgewright

SYNOPSIS
    fw-global-registry.sh <command> [options]

COMMANDS
    list                      List all registered projects
    add [path]                Register a project (default: current directory)
    remove [path]             Unregister a project
    check [path]              Check if a project is registered
    update [path]             Update project information
    clean                     Remove stale entries (non-existent paths)
    export [file]             Export registry to JSON file
    import [file]             Import registry from JSON file
    status                    Show registry status

EXAMPLES
    # List all projects
    fw-global-registry.sh list

    # Register current project
    fw-global-registry.sh add

    # Register specific project
    fw-global-registry.sh add /path/to/project

    # Check if project is registered
    fw-global-registry.sh check /path/to/project

    # Clean stale entries
    fw-global-registry.sh clean

    # Export for backup
    fw-global-registry.sh export ~/forgewright-registry-backup.json

EOF
}

# ─── Registry Helpers ───────────────────────────────────────────────────────

init_registry() {
    if [[ ! -f "$GLOBAL_REGISTRY" ]]; then
        mkdir -p "$GLOBAL_CONFIG_DIR"
        cat > "$GLOBAL_REGISTRY" << 'EOF'
{
  "version": "1.0",
  "created_at": "",
  "updated_at": "",
  "projects": {}
}
EOF
    fi
    
    # Ensure timestamps
    node -e "
var fs = require('fs');
var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
var now = new Date().toISOString();
if (!reg.created_at) reg.created_at = now;
reg.updated_at = now;
fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
"
}

update_timestamp() {
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    reg.updated_at = new Date().toISOString();
    fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
} catch(e) {}
"
}

get_registry() {
    if [[ -f "$GLOBAL_REGISTRY" ]]; then
        cat "$GLOBAL_REGISTRY"
    else
        echo '{"projects":{}}'
    fi
}

project_exists() {
    local path="$1"
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    console.log(reg.projects['${path}'] ? '1' : '0');
} catch(e) { console.log('0'); }
"
}

# ─── Command: List ──────────────────────────────────────────────────────────

cmd_list() {
    init_registry
    
    echo ""
    echo -e "${CYAN}━━━ Registered Projects ━━━${NC}"
    echo ""
    
    local count
    count=$(node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    console.log(Object.keys(reg.projects || {}).length);
} catch(e) { console.log('0'); }
")
    
    if [[ "$count" == "0" ]]; then
        log_info "No projects registered"
        log_info ""
        log_info "Register a project:"
        log_info "  fw-global-registry.sh add /path/to/project"
        echo ""
        return 0
    fi
    
    # Print each project
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    var projects = reg.projects || {};
    
    Object.keys(projects).sort().forEach(function(path) {
        var p = projects[path];
        var exists = require('fs').existsSync(path) ? '✓' : '✗';
        console.log('[' + exists + '] ' + path);
        if (p.forgewright_path) {
            console.log('    Forgewright: ' + p.forgewright_path);
        }
        if (p.registered_at) {
            console.log('    Registered: ' + p.registered_at);
        }
        if (p.last_used) {
            console.log('    Last used: ' + p.last_used);
        }
        console.log('');
    });
    
    console.log('Total: ' + Object.keys(projects).length + ' project(s)');
} catch(e) { console.log('Error reading registry'); }
"
    
    echo ""
}

# ─── Command: Add ───────────────────────────────────────────────────────────

cmd_add() {
    local path="${1:-$(pwd)}"
    
    # Normalize path
    path="$(cd "$path" 2>/dev/null && pwd -P)" || {
        log_error "Invalid path: $path"
        exit 1
    }
    
    init_registry
    
    # Check if already registered
    if [[ "$(project_exists "$path")" == "1" ]]; then
        log_ok "Already registered: $path"
        return 0
    fi
    
    # Find forgewright for this project
    local forgewright_path=""
    local current="$path"
    
    while [[ "$current" != "/" ]] && [[ "$current" != "$HOME" ]]; do
        if [[ -f "$current/forgewright/AGENTS.md" ]] || [[ -f "$current/forgewright/CLAUDE.md" ]]; then
            forgewright_path="$current/forgewright"
            break
        fi
        if [[ -f "$current/AGENTS.md" ]] || [[ -f "$current/CLAUDE.md" ]]; then
            forgewright_path="$current"
            break
        fi
        current="$(dirname "$current")"
    done
    
    # Add to registry
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    if (!reg.projects) reg.projects = {};
    reg.projects['${path}'] = {
        forgewright_path: '${forgewright_path}' || null,
        registered_at: new Date().toISOString(),
        last_used: new Date().toISOString()
    };
    fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
    console.log('OK');
} catch(e) { console.log('ERROR'); }
" 2>/dev/null
    
    if [[ $? -eq 0 ]]; then
        log_ok "Registered: $path"
        if [[ -n "$forgewright_path" ]]; then
            log_info "  Forgewright: $forgewright_path"
        fi
    else
        log_error "Failed to register: $path"
        exit 1
    fi
}

# ─── Command: Remove ────────────────────────────────────────────────────────

cmd_remove() {
    local path="${1:-}"
    
    if [[ -z "$path" ]]; then
        log_error "Path required"
        log_info "Usage: fw-global-registry.sh remove /path/to/project"
        exit 1
    fi
    
    # Normalize path
    path="$(cd "$path" 2>/dev/null && pwd -P)" || {
        log_error "Invalid path: $path"
        exit 1
    }
    
    init_registry
    
    # Check if exists
    if [[ "$(project_exists "$path")" != "1" ]]; then
        log_warn "Not registered: $path"
        return 0
    fi
    
    # Remove from registry
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    delete reg.projects['${path}'];
    fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
    console.log('OK');
} catch(e) { console.log('ERROR'); }
"
    
    if [[ $? -eq 0 ]]; then
        log_ok "Unregistered: $path"
    else
        log_error "Failed to unregister: $path"
        exit 1
    fi
}

# ─── Command: Check ────────────────────────────────────────────────────────

cmd_check() {
    local path="${1:-$(pwd)}"
    
    # Normalize path
    path="$(cd "$path" 2>/dev/null && pwd -P)" || {
        echo "NOT_REGISTERED"
        exit 1
    }
    
    init_registry
    
    if [[ "$(project_exists "$path")" == "1" ]]; then
        log_ok "Registered: $path"
        
        # Show details
        node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    var p = reg.projects['${path}'];
    if (p) {
        console.log('');
        console.log('  Forgewright: ' + (p.forgewright_path || 'auto'));
        console.log('  Registered:  ' + (p.registered_at || 'unknown'));
        console.log('  Last used:   ' + (p.last_used || 'never'));
    }
} catch(e) {}
"
    else
        log_info "Not registered: $path"
    fi
}

# ─── Command: Update ────────────────────────────────────────────────────────

cmd_update() {
    local path="${1:-$(pwd)}"
    
    # Normalize path
    path="$(cd "$path" 2>/dev/null && pwd -P)" || {
        log_error "Invalid path: $path"
        exit 1
    }
    
    init_registry
    
    if [[ "$(project_exists "$path")" != "1" ]]; then
        log_warn "Not registered, adding instead..."
        cmd_add "$path"
        return $?
    fi
    
    # Update last_used timestamp
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    if (reg.projects['${path}']) {
        reg.projects['${path}'].last_used = new Date().toISOString();
        fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
        console.log('OK');
    }
} catch(e) { console.log('ERROR'); }
"
    
    if [[ $? -eq 0 ]]; then
        log_ok "Updated: $path"
    else
        log_error "Failed to update: $path"
        exit 1
    fi
}

# ─── Command: Clean ─────────────────────────────────────────────────────────

cmd_clean() {
    init_registry
    
    echo ""
    echo -e "${CYAN}━━━ Cleaning Stale Entries ━━━${NC}"
    echo ""
    
    # Find non-existent paths
    local stale=()
    while IFS= read -r path; do
        if [[ -n "$path" ]] && [[ ! -d "$path" ]]; then
            stale+=("$path")
        fi
    done < <(node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    Object.keys(reg.projects || {}).forEach(function(p) { console.log(p); });
} catch(e) {}
")
    
    if [[ ${#stale[@]} -eq 0 ]]; then
        log_ok "No stale entries found"
        return 0
    fi
    
    log_info "Found ${#stale[@]} stale entries:"
    for path in "${stale[@]}"; do
        log_info "  - $path"
    done
    echo ""
    
    # Remove stale entries
    local removed=0
    for path in "${stale[@]}"; do
        node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    delete reg.projects['${path}'];
    fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
} catch(e) {}
" 2>/dev/null
        ((removed++))
    done
    
    log_ok "Removed $removed stale entries"
}

# ─── Command: Export ───────────────────────────────────────────────────────

cmd_export() {
    local file="${1:-${HOME}/forgewright-registry-export.json}"
    
    init_registry
    
    cp "$GLOBAL_REGISTRY" "$file"
    log_ok "Exported to: $file"
}

# ─── Command: Import ───────────────────────────────────────────────────────

cmd_import() {
    local file="$1"
    
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        exit 1
    fi
    
    # Validate JSON
    if ! node -e "JSON.parse(require('fs').readFileSync('${file}', 'utf8'))" 2>/dev/null; then
        log_error "Invalid JSON: $file"
        exit 1
    fi
    
    # Backup current
    if [[ -f "$GLOBAL_REGISTRY" ]]; then
        cp "$GLOBAL_REGISTRY" "${GLOBAL_REGISTRY}.bak.$(date +%Y%m%d%H%M%S)"
        log_info "Backed up current registry"
    fi
    
    # Import
    mkdir -p "$GLOBAL_CONFIG_DIR"
    cp "$file" "$GLOBAL_REGISTRY"
    log_ok "Imported from: $file"
}

# ─── Command: Status ────────────────────────────────────────────────────────

cmd_status() {
    init_registry
    
    echo ""
    echo -e "${CYAN}━━━ Registry Status ━━━${NC}"
    echo ""
    
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    var projects = reg.projects || {};
    var paths = Object.keys(projects);
    var total = paths.length;
    var stale = 0;
    
    paths.forEach(function(p) {
        if (!fs.existsSync(p)) stale++;
    });
    
    console.log('  Registry:    ${GLOBAL_REGISTRY}');
    console.log('  Total:      ' + total + ' project(s)');
    console.log('  Active:     ' + (total - stale) + ' project(s)');
    console.log('  Stale:      ' + stale + ' entry(ies)');
    console.log('  Created:    ' + (reg.created_at || 'unknown'));
    console.log('  Updated:    ' + (reg.updated_at || 'unknown'));
} catch(e) {
    console.log('  Error reading registry');
}
"
    echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────

main() {
    local cmd="${1:-}"
    
    if [[ -z "$cmd" ]]; then
        show_help
        exit 0
    fi
    
    shift
    
    case "$cmd" in
        list)       cmd_list "$@" ;;
        add)        cmd_add "$@" ;;
        remove)     cmd_remove "$@" ;;
        check)      cmd_check "$@" ;;
        update)     cmd_update "$@" ;;
        clean)      cmd_clean "$@" ;;
        export)     cmd_export "$@" ;;
        import)     cmd_import "$@" ;;
        status)     cmd_status "$@" ;;
        -h|--help)  show_help ;;
        *)          log_error "Unknown command: $cmd"; show_help; exit 1 ;;
    esac
}

main "$@"
