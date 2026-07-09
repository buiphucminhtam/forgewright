#!/bin/bash
#===============================================================================
# Forgewright Dependency Graph Generator
#===============================================================================
# Purpose: Auto-generate skill dependency graph, detect circular deps, impact analysis
# Version: 1.1.0 (bash 3.2 compatible)
# Created: 2026-05-29
# Phase: 3.4
#===============================================================================

# Use 'set +u' to handle unbound variables gracefully
set +u

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKILLS_DIR="${PROJECT_DIR}/skills"
PROTOCOLS_DIR="${SKILLS_DIR}/_shared/protocols"
SCRIPTS_DIR="${PROJECT_DIR}/scripts"
METRICS_DIR="${PROJECT_DIR}/.forgewright/metrics"
GRAPHS_DIR="${METRICS_DIR}/graphs"
DEP_GRAPH_JSON="${METRICS_DIR}/dependency-graph.json"

# Ensure directories exist
mkdir -p "${METRICS_DIR}" "${GRAPHS_DIR}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

#-------------------------------------------------------------------------------
# Utility Functions
#-------------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" >&2
}

#-------------------------------------------------------------------------------
# Dependency Extraction
#-------------------------------------------------------------------------------

# Get all skill directories (comma-separated)
get_skills() {
    # Build list using find with null termination, then process
    local tmpfile
    tmpfile=$(mktemp)
    find "${SKILLS_DIR}" -maxdepth 1 -type d -name '[!_]*' -printf '%f\n' 2>/dev/null | \
        grep -v '^\.' | sort > "$tmpfile"
    
    # Convert to comma-separated
    local result
    result=$(paste -sd ',' "$tmpfile")
    rm -f "$tmpfile"
    echo "$result"
}

# Check if skill exists in comma-separated list
skill_exists() {
    local skill="$1"
    local skills="$2"
    echo "$skills" | grep -q ",${skill}," || echo "$skills" | grep -q "^${skill}," || echo "$skills" | grep -q ",${skill}$" || [ "$skills" = "$skill" ]
}

# Extract dependencies for a skill
get_dependencies() {
    local skill="$1"
    local skill_file="${SKILLS_DIR}/${skill}/SKILL.md"
    local result=""
    
    if [ ! -f "$skill_file" ]; then
        echo ""
        return
    fi
    
    # Extract skill references: cat skills/XXX/SKILL.md
    local skill_refs
    skill_refs=$(grep -oE 'cat skills/[a-z][a-z0-9-]*/SKILL\.md' "$skill_file" 2>/dev/null | \
                  sed 's|cat skills/||g;s|/SKILL\.md||g' || echo "")
    
    for ref in $skill_refs; do
        if [ "$ref" != "$skill" ] && [ -d "${SKILLS_DIR}/${ref}" ]; then
            if [ -n "$result" ]; then
                result="${result} ${ref}"
            else
                result="$ref"
            fi
        fi
    done
    
    # Extract protocol references: cat skills/_shared/protocols/XXX.md
    local protocol_refs
    protocol_refs=$(grep -oE 'cat skills/_shared/protocols/[a-z][a-z0-9-]+\.md' "$skill_file" 2>/dev/null | \
                    sed 's|cat skills/_shared/protocols/||g;s|\.md||g' || echo "")
    
    for ref in $protocol_refs; do
        if [ -n "$result" ]; then
            result="${result} protocol:${ref}"
        else
            result="protocol:${ref}"
        fi
    done
    
    # Extract script references: bash scripts/XXX.sh
    local script_refs
    script_refs=$(grep -oE 'bash scripts/[a-z][a-z0-9-]+\.sh' "$skill_file" 2>/dev/null | \
                  sed 's|bash scripts/||g;s|\.sh||g' || echo "")
    
    for ref in $script_refs; do
        if [ -n "$result" ]; then
            result="${result} script:${ref}"
        else
            result="script:${ref}"
        fi
    done
    
    echo "$result"
}

# Get skill category
get_skill_category() {
    local skill="$1"
    
    # Map skill patterns to categories
    case "$skill" in
        *game*|*unity*|*unreal*|*godot*|*roblox*|*phaser*|*threejs*)
            echo "game"
            ;;
        *orchestrat*|*polymath*|*parallel*|*memory*|*skill-maker*|*mcp-generator*|*goal*)
            echo "orchestration"
            ;;
        *frontend*|*software*|*backend*|*fullstack*|*mobile*)
            echo "engineering"
            ;;
        *ai*|*prompt*|*data*)
            echo "ai-ml"
            ;;
        *devops*|*sre*|*database*|*infrastructure*)
            echo "devops"
            ;;
        *security*|*accessibility*)
            echo "security"
            ;;
        *ux*|*ui*|*design*|*interaction*|*art*)
            echo "design"
            ;;
        *test*|*qa*|*debug*|*review*|*quality*)
            echo "quality"
            ;;
        *business*|*product*|*project*|*analyst*)
            echo "business"
            ;;
        *growth*|*marketing*|*conversion*)
            echo "growth"
            ;;
        *xr*|*vr*|*ar*|*mr*)
            echo "xr"
            ;;
        *writer*|*document*)
            echo "documentation"
            ;;
        *)
            echo "general"
            ;;
    esac
}

#-------------------------------------------------------------------------------
# Graph Generation
#-------------------------------------------------------------------------------

generate_graph_json() {
    local skills
    skills=$(get_skills)
    local skill_count=0
    
    log_info "Generating dependency graph..."
    
    local nodes_json=""
    local edges_json=""
    local first_node=true
    local first_edge=true
    
    # Count skills
    skill_count=$(echo "$skills" | tr ',' '\n' | wc -l | tr -d ' ')
    
    # Build nodes JSON (skills)
    local skill
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        local category
        category=$(get_skill_category "$skill")
        
        if [ "$first_node" = true ]; then
            first_node=false
        else
            nodes_json="${nodes_json},"
        fi
        
        nodes_json="${nodes_json}
        {
            \"id\": \"$skill\",
            \"type\": \"skill\",
            \"label\": \"$skill\",
            \"category\": \"$category\"
        }"
    done
    
    # Build edges by re-reading all skills
    local edge_count=0
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        
        local deps
        deps=$(get_dependencies "$skill")
        
        for dep in $deps; do
            # Skip non-skill dependencies
            [[ "$dep" == protocol:* ]] && continue
            [[ "$dep" == script:* ]] && continue
            
            # Check if target exists
            if echo "$skills" | grep -q ",${dep}," 2>/dev/null || \
               echo "$skills" | grep -q "^${dep}," 2>/dev/null; then
                edge_count=$((edge_count + 1))
                if [ "$first_edge" = true ]; then
                    first_edge=false
                else
                    edges_json="${edges_json},"
                fi
                edges_json="${edges_json}
        {
            \"source\": \"$skill\",
            \"target\": \"$dep\",
            \"type\": \"direct\"
        }"
            fi
        done
    done
    
    # Count protocols
    local protocol_count
    protocol_count=$(find "${PROTOCOLS_DIR}" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
    
    # Count scripts
    local script_count
    script_count=$(find "${SCRIPTS_DIR}" -name '*.sh' 2>/dev/null | wc -l | tr -d ' ')
    
    # Write graph JSON
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "${DEP_GRAPH_JSON}" <<EOF
{
    "generated": "${timestamp}",
    "nodes": {
        "skills": [${nodes_json}
        ],
        "protocols": [],
        "scripts": []
    },
    "edges": [${edges_json}
    ],
    "metadata": {
        "total_skills": ${skill_count},
        "total_dependencies": ${edge_count},
        "total_protocols": ${protocol_count},
        "total_scripts": ${script_count}
    }
}
EOF
    
    log_success "Graph written to ${DEP_GRAPH_JSON}"
}

#-------------------------------------------------------------------------------
# Circular Dependency Detection
#-------------------------------------------------------------------------------

check_circular_dependencies() {
    log_info "Checking for circular dependencies..."
    echo ""
    
    local skills
    skills=$(get_skills)
    local cycle_count=0
    
    # For each skill, check if it can reach itself through dependencies
    # Use temp file to avoid subshell variable issue
    local cycle_file
    cycle_file=$(mktemp)
    
    for skill in $(echo "$skills" | tr ',' '\n'); do
        [ -z "$skill" ] && continue
        
        # DFS to find path from skill back to skill
        local visited=""
        local stack="$skill"
        
        while [ -n "$stack" ]; do
            # Pop last element
            local current="${stack##* }"
            stack="${stack% *}"
            [ -z "$stack" ] && stack=""
            
            # Skip if already visited (use string matching, not grep)
            if [[ ",$visited," == *",${current},"* ]]; then
                continue
            fi
            visited="${visited}${current},"
            
            # Check dependencies
            local deps
            deps=$(get_dependencies "$current")
            
            for dep in $deps; do
                # Skip non-skill dependencies
                [[ "$dep" == protocol:* ]] && continue
                [[ "$dep" == script:* ]] && continue
                
                # Check if dep is a valid skill (use string matching)
                if [[ ",${skills}," != *",${dep},"* ]]; then
                    continue
                fi
                
                # Found cycle!
                if [ "$dep" = "$skill" ]; then
                    cycle_count=$((cycle_count + 1))
                    echo -e "  ${RED}Cycle found:${NC} $skill -> $current -> ... -> $skill"
                    echo "$skill:$current" >> "$cycle_file"
                    continue 2
                fi
                
                # Add to stack
                stack="${stack} ${dep}"
            done
        done
    done
    
    rm -f "$cycle_file"
    echo ""
    if [ "$cycle_count" -gt 0 ]; then
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo -e "  ${RED}CIRCULAR DEPENDENCIES DETECTED: ${cycle_count}${NC}"
        echo "───────────────────────────────────────────────────────────────────────────────"
        log_warning "Circular dependencies must be resolved before release"
        return 1
    else
        log_success "No circular dependencies detected!"
        return 0
    fi
}

#-------------------------------------------------------------------------------
# Impact Analysis
#-------------------------------------------------------------------------------

analyze_impact() {
    local target_skill="${1:-}"
    
    if [ -z "$target_skill" ]; then
        log_error "Usage: $0 impact <skill-name>"
        return 1
    fi
    
    log_info "Analyzing impact of changes to '$target_skill'..."
    echo ""
    
    local skills
    skills=$(get_skills)
    
    # Check if skill exists
    local skills_lower
    skills_lower=$(echo "$skills" | tr '[:upper:]' '[:lower:]')
    local target_lower
    target_lower=$(echo "$target_skill" | tr '[:upper:]' '[:lower:]')
    
    if ! echo ",${skills_lower}," | grep -q ",${target_lower}," 2>/dev/null; then
        log_error "Skill not found: $target_skill"
        return 1
    fi
    
    # Find direct dependents (skills that depend on target)
    local direct_deps=""
    local all_deps=""
    
    local skill
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        
        # Case-insensitive comparison
        local skill_lower
        local target_lower
        skill_lower=$(echo "$skill" | tr '[:upper:]' '[:lower:]')
        target_lower=$(echo "$target_skill" | tr '[:upper:]' '[:lower:]')
        
        [ "$skill_lower" = "$target_lower" ] && continue
        
        local deps
        deps=$(get_dependencies "$skill")
        
        for dep in $deps; do
            local dep_lower
            dep_lower=$(echo "$dep" | tr '[:upper:]' '[:lower:]')
            if [ "$dep_lower" = "$target_lower" ]; then
                if [ -n "$direct_deps" ]; then
                    direct_deps="${direct_deps},${skill}"
                else
                    direct_deps="$skill"
                fi
                if [ -n "$all_deps" ]; then
                    all_deps="${all_deps},${skill}"
                else
                    all_deps="$skill"
                fi
            fi
        done
    done
    
    # Find transitive dependents
    local queue="$direct_deps"
    while [ -n "$queue" ]; do
        local current
        current=$(echo "$queue" | cut -d',' -f1)
        queue=$(echo "$queue" | cut -d',' -f2-)
        
        [ -z "$current" ] && continue
        
        local deps
        deps=$(get_dependencies "$current")
        
        for dep in $deps; do
            [[ "$dep" == protocol:* ]] && continue
            [[ "$dep" == script:* ]] && continue
            
            # Check if it's a valid skill we haven't added yet
            local dep_lower
            dep_lower=$(echo "$dep" | tr '[:upper:]' '[:lower:]')
            
            if ! echo ",${all_deps}," | grep -q ",${dep_lower}," 2>/dev/null; then
                if echo ",${skills}," | grep -q ",${dep}," 2>/dev/null || \
                   echo "${skills}" | grep -q "^${dep}," 2>/dev/null; then
                    if [ -n "$all_deps" ]; then
                        all_deps="${all_deps},${dep}"
                    else
                        all_deps="$dep"
                    fi
                    queue="${queue},${dep}"
                fi
            fi
        done
    done
    
    # Get dependencies of target skill
    local target_deps
    target_deps=$(get_dependencies "$target_skill")
    
    # Report
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "                          IMPACT ANALYSIS"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    
    echo "Target Skill: $target_skill"
    echo "Category: $(get_skill_category "$target_skill")"
    echo ""
    
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo "  DEPENDENCIES"
    echo "───────────────────────────────────────────────────────────────────────────────"
    for dep in $target_deps; do
        if [[ "$dep" == protocol:* ]]; then
            echo -e "  ${CYAN}[protocol]${NC} ${dep#protocol:}"
        elif [[ "$dep" == script:* ]]; then
            echo -e "  ${MAGENTA}[script]${NC} ${dep#script:}"
        else
            echo -e "  ${BLUE}[skill]${NC} $dep"
        fi
    done
    
    echo ""
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo "  DIRECT DEPENDENTS"
    echo "───────────────────────────────────────────────────────────────────────────────"
    if [ -z "$direct_deps" ]; then
        echo "  No direct dependents"
    else
        echo "$direct_deps" | tr ',' '\n' | while IFS= read -r dep; do
            [ -z "$dep" ] && continue
            echo -e "  ${RED}●${NC} $dep"
        done
    fi
    
    echo ""
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo "  TOTAL AFFECTED"
    echo "───────────────────────────────────────────────────────────────────────────────"
    if [ -z "$all_deps" ]; then
        echo "  No dependent skills - safe to modify"
    else
        local dep_count
        dep_count=$(echo "$all_deps" | tr ',' '\n' | wc -l | tr -d ' ')
        echo "  $dep_count skills affected"
        echo "$all_deps" | tr ',' '\n' | while IFS= read -r dep; do
            [ -z "$dep" ] && continue
            echo -e "    ${RED}●${NC} $dep"
        done
    fi
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════════"
    
    # Risk assessment
    local dep_count
    dep_count=$(echo "$all_deps" | tr ',' '\n' | wc -l | tr -d ' ')
    local risk_level="LOW"
    if [ "$dep_count" -gt 10 ]; then
        risk_level="CRITICAL"
    elif [ "$dep_count" -gt 5 ]; then
        risk_level="HIGH"
    elif [ "$dep_count" -gt 0 ]; then
        risk_level="MEDIUM"
    fi
    
    case "$risk_level" in
        LOW)    echo -e "  Risk Level: ${GREEN}LOW${NC}" ;;
        MEDIUM) echo -e "  Risk Level: ${YELLOW}MEDIUM${NC}" ;;
        HIGH)   echo -e "  Risk Level: ${RED}HIGH${NC}" ;;
        CRITICAL) echo -e "  Risk Level: ${RED}CRITICAL${NC}" ;;
    esac
    
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    
    return 0
}

#-------------------------------------------------------------------------------
# ASCII Graph Visualization
#-------------------------------------------------------------------------------

show_ascii_graph() {
    local skills
    skills=$(get_skills)
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "                       FORGEWRIGHT SKILL DEPENDENCIES"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Group by category and display
    for category in orchestration engineering ai-ml devops security design quality business growth xr game documentation general; do
        local found=false
        local category_skills=""
        
        echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
            [ -z "$skill" ] && continue
            local cat
            cat=$(get_skill_category "$skill")
            if [ "$cat" = "$category" ]; then
                found=true
                if [ -n "$category_skills" ]; then
                    category_skills="${category_skills} ${skill}"
                else
                    category_skills="$skill"
                fi
            fi
        done
        
        if [ "$found" = true ]; then
            echo -e "  ${CYAN}[$category]${NC}"
            
            for skill in $category_skills; do
                [ -z "$skill" ] && continue
                local deps
                deps=$(get_dependencies "$skill")
                
                # Filter to skill-only deps
                local skill_deps=""
                for dep in $deps; do
                    [[ "$dep" == protocol:* ]] && continue
                    [[ "$dep" == script:* ]] && continue
                    if [ -n "$skill_deps" ]; then
                        skill_deps="${skill_deps} $dep"
                    else
                        skill_deps="$dep"
                    fi
                done
                
                if [ -n "$skill_deps" ]; then
                    printf "    %-25s → %s\n" "$skill" "$skill_deps"
                else
                    printf "    %-25s\n" "$skill"
                fi
            done
            echo ""
        fi
    done
    
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
}

#-------------------------------------------------------------------------------
# Export Functions
#-------------------------------------------------------------------------------

export_dot() {
    local output_file="${GRAPHS_DIR}/dependencies.dot"
    
    log_info "Exporting DOT graph to ${output_file}..."
    
    local skills
    skills=$(get_skills)
    
    cat > "${output_file}" <<'EOF'
// Forgewright Skill Dependency Graph
// Generated by dep-graph.sh
digraph forgewright {
    rankdir=TB;
    node [shape=box, style=rounded, fontname="Helvetica"];
    edge [fontname="Helvetica"];
    
EOF
    
    # Add all skills as nodes grouped by category
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        local category
        category=$(get_skill_category "$skill")
        echo "    \"$skill\" [label=\"$skill\", category=\"$category\"];" >> "${output_file}"
    done
    
    echo "" >> "${output_file}"
    echo "    // Dependencies" >> "${output_file}"
    
    # Add edges
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        
        local deps
        deps=$(get_dependencies "$skill")
        
        for dep in $deps; do
            [[ "$dep" == protocol:* ]] && continue
            [[ "$dep" == script:* ]] && continue
            
            # Check if target exists
            if echo "$skills" | grep -q ",${dep}," 2>/dev/null || \
               echo "$skills" | grep -q "^${dep}," 2>/dev/null; then
                echo "    \"$skill\" -> \"$dep\";" >> "${output_file}"
            fi
        done
    done
    
    echo "}" >> "${output_file}"
    
    log_success "DOT graph written to ${output_file}"
    echo ""
    echo "  To render: dot -Tpng ${output_file} -o dependencies.png"
    echo ""
}

export_mermaid() {
    local output_file="${GRAPHS_DIR}/dependencies.mmd"
    
    log_info "Exporting Mermaid graph to ${output_file}..."
    
    local skills
    skills=$(get_skills)
    
    cat > "${output_file}" <<'EOF'
%%{ init: { 'theme': 'base', 'themeVariables': { 'primaryColor': '#4CAF50' } } }%%
graph TB
EOF
    
    # Add nodes
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        echo "    ${skill}((${skill}))" >> "${output_file}"
    done
    
    echo "" >> "${output_file}"
    echo "    %% Dependencies" >> "${output_file}"
    
    # Add edges
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        
        local deps
        deps=$(get_dependencies "$skill")
        
        for dep in $deps; do
            [[ "$dep" == protocol:* ]] && continue
            [[ "$dep" == script:* ]] && continue
            
            if echo "$skills" | grep -q ",${dep}," 2>/dev/null || \
               echo "$skills" | grep -q "^${dep}," 2>/dev/null; then
                echo "    ${skill} --> ${dep}" >> "${output_file}"
            fi
        done
    done
    
    log_success "Mermaid graph written to ${output_file}"
}

export_json() {
    if [ ! -f "${DEP_GRAPH_JSON}" ]; then
        generate_graph_json
    fi
    
    log_success "Graph JSON at ${DEP_GRAPH_JSON}"
    echo ""
    cat "${DEP_GRAPH_JSON}" | head -30
    echo "..."
}

#-------------------------------------------------------------------------------
# Usage
#-------------------------------------------------------------------------------

usage() {
    cat <<EOF
Forgewright Dependency Graph Generator v1.1.0

USAGE:
    $0 <command> [options]

COMMANDS:
    generate, gen
        Generate dependency graph (JSON format)
    
    check-cycles, cycles
        Check for circular dependencies
    
    impact <skill-name>
        Analyze impact of changing a skill
    
    graph, visualize, show
        Display ASCII dependency graph
    
    export <format>
        Export graph in various formats
        Formats: dot, mermaid, json
    
    help
        Show this help message

EXAMPLES:
    # Generate dependency graph
    $0 generate
    
    # Check for circular dependencies
    $0 check-cycles
    
    # Analyze impact of software-engineer changes
    $0 impact software-engineer
    
    # Show ASCII graph
    $0 graph
    
    # Export as DOT for GraphViz
    $0 export dot
    
    # Export as Mermaid
    $0 export mermaid

EOF
}

#-------------------------------------------------------------------------------
# Main Entry Point
#-------------------------------------------------------------------------------

main() {
    local command="${1:-help}"
    shift 2>/dev/null || true
    
    case "$command" in
        generate|gen)
            generate_graph_json
            ;;
        check-cycles|cycles)
            check_circular_dependencies
            ;;
        impact)
            analyze_impact "$1"
            ;;
        graph|visualize|show)
            show_ascii_graph
            ;;
        export)
            case "$1" in
                dot) export_dot ;;
                mermaid) export_mermaid ;;
                json) export_json ;;
                *) log_error "Unknown format: $1" ;;
            esac
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
