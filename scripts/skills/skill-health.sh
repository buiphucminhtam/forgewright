#!/bin/bash
#===============================================================================
# Forgewright Skill Health Checker
#===============================================================================
# Purpose: Automated validation of skill integrity
# Version: 1.1.0 (bash 3.2 compatible)
# Created: 2026-05-29
# Phase: 3.3
#===============================================================================

# Use 'set +u' to handle unbound variables gracefully
set +u

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKILLS_DIR="${PROJECT_DIR}/skills"
PROTOCOLS_DIR="${SKILLS_DIR}/_shared/protocols"
METRICS_DIR="${PROJECT_DIR}/.forgewright/metrics"
HEALTH_REPORT="${METRICS_DIR}/health-report-$(date +%Y%m%d).json"
HEALTH_HISTORY="${METRICS_DIR}/health-history.jsonl"

# Ensure metrics directory exists
mkdir -p "${METRICS_DIR}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters (using simple variables)
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
TOTAL_SKILLS=0
CHECKED_SKILLS=0

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

severity_color() {
    local severity="$1"
    case "$severity" in
        CRITICAL) echo -e "${RED}" ;;
        HIGH) echo -e "${RED}" ;;
        MEDIUM) echo -e "${YELLOW}" ;;
        LOW) echo -e "${GREEN}" ;;
        *) echo -e "${NC}" ;;
    esac
}

#-------------------------------------------------------------------------------
# Get All Skills
#-------------------------------------------------------------------------------

get_skills() {
    local result=""
    for skill_dir in "${SKILLS_DIR}"/*/; do
        [ -d "$skill_dir" ] || continue
        local skill_name
        skill_name=$(basename "$skill_dir")
        # Skip _shared, _test, .agents, etc.
        if [[ "$skill_name" == "_"* ]] || [[ "$skill_name" == "."* ]]; then
            continue
        fi
        if [ -n "$result" ]; then
            result="${result},${skill_name}"
        else
            result="$skill_name"
        fi
    done
    echo "$result"
}

#-------------------------------------------------------------------------------
# Check Functions
#-------------------------------------------------------------------------------

check_schema() {
    local skill="$1"
    local skill_dir="${SKILLS_DIR}/${skill}"
    local skill_file="${skill_dir}/SKILL.md"
    
    # Check if SKILL.md exists
    if [ ! -f "$skill_file" ]; then
        echo "FAIL"
        echo "Missing: SKILL.md"
        return 1
    fi
    
    # Check if file is readable and non-empty
    if [ ! -s "$skill_file" ]; then
        echo "FAIL"
        echo "Empty: SKILL.md"
        return 1
    fi
    
    # Basic structure check
    if ! grep -q "^# " "$skill_file" && ! grep -q "^## " "$skill_file"; then
        if ! grep -q "^> " "$skill_file"; then
            echo "FAIL"
            echo "Missing: title and content structure"
            return 1
        fi
    fi
    
    echo "PASS"
}

check_dependencies() {
    local skill="$1"
    local skill_file="${SKILLS_DIR}/${skill}/SKILL.md"
    local missing=""
    local issues=""
    
    # Check for skill references
    local skill_refs
    skill_refs=$(grep -oE 'skills/[a-z][a-z0-9-]*/SKILL\.md' "$skill_file" 2>/dev/null | \
                  sed 's|skills/||g;s|/SKILL\.md||g' || echo "")
    
    for ref in $skill_refs; do
        if [ -z "$ref" ] || [ "$ref" = "$skill" ]; then
            continue
        fi
        local ref_path="${SKILLS_DIR}/${ref}/SKILL.md"
        if [ ! -f "$ref_path" ]; then
            missing="${missing}skill: ${ref} "
        fi
    done
    
    # Check for protocol references
    local protocol_refs
    protocol_refs=$(grep -oE 'skills/_shared/protocols/[a-z][a-z0-9-]+\.md' "$skill_file" 2>/dev/null | \
                    sed 's|skills/_shared/protocols/||g;s|\.md||g' || echo "")
    
    for ref in $protocol_refs; do
        if [ -z "$ref" ]; then
            continue
        fi
        local ref_path="${PROTOCOLS_DIR}/${ref}.md"
        if [ ! -f "$ref_path" ]; then
            missing="${missing}protocol: ${ref} "
        fi
    done
    
    # Check for script references
    local script_refs
    script_refs=$(grep -oE 'scripts/[a-z][a-z0-9-]+\.sh' "$skill_file" 2>/dev/null | \
                  sed 's|scripts/||g;s|\.sh||g' || echo "")
    
    for ref in $script_refs; do
        if [ -z "$ref" ]; then
            continue
        fi
        local script_path="${SCRIPT_DIR}/scripts/${ref}.sh"
        if [ ! -f "$script_path" ]; then
            missing="${missing}script: ${ref} "
        elif [ ! -x "$script_path" ]; then
            issues="${issues}script not executable: ${ref} "
        fi
    done
    
    if [ -n "$missing" ]; then
        echo "FAIL"
        echo "  Missing: $missing"
        return 1
    fi
    
    if [ -n "$issues" ]; then
        echo "WARN"
        echo "  Issues: $issues"
        return 2
    fi
    
    echo "PASS"
}

check_templates() {
    local skill="$1"
    local skill_file="${SKILLS_DIR}/${skill}/SKILL.md"
    local templates_dir="${SKILLS_DIR}/${skill}/templates"
    local missing=""
    
    # Find template references
    local template_refs
    template_refs=$(grep -oE '\[\[template:([a-z0-9-]+)\]\]' "$skill_file" 2>/dev/null | \
                     sed 's/\[\[template:\([a-z0-9-]+\)\]\]/\1/' || echo "")
    
    for template in $template_refs; do
        if [ -z "$template" ]; then
            continue
        fi
        local template_file="${templates_dir}/${template}.md"
        if [ ! -f "$template_file" ]; then
            missing="${missing}${template} "
        fi
    done
    
    if [ -n "$missing" ]; then
        echo "WARN"
        echo "  Missing templates: $missing"
        return 2
    fi
    
    echo "PASS"
}

check_protocols() {
    local skill="$1"
    local skill_file="${SKILLS_DIR}/${skill}/SKILL.md"
    local missing=""
    
    # Find protocol references
    local protocol_refs
    protocol_refs=$(grep -oE 'skills/_shared/protocols/[a-z][a-z0-9-]+\.md' "$skill_file" 2>/dev/null || echo "")
    
    for ref in $protocol_refs; do
        local ref_path="${PROJECT_DIR}/${ref}"
        if [ ! -f "$ref_path" ]; then
            missing="${missing}${ref} "
        fi
    done
    
    if [ -n "$missing" ]; then
        echo "FAIL"
        echo "  Missing protocols: $missing"
        return 1
    fi
    
    echo "PASS"
}

check_scripts() {
    local skill="$1"
    local skill_file="${SKILLS_DIR}/${skill}/SKILL.md"
    local missing=""
    local not_executable=""
    local syntax_errors=""
    
    # Find script references (backtick format)
    local script_refs
    script_refs=$(grep -oE '`([^`]*\.sh)`' "$skill_file" 2>/dev/null | \
                   sed 's/`//g' || echo "")
    
    for script in $script_refs; do
        if [ -z "$script" ] || [[ "$script" != *.sh ]]; then
            continue
        fi
        # Remove leading path if present
        script=$(echo "$script" | sed 's|.*/||')
        local script_path="${SCRIPT_DIR}/scripts/${script}"
        
        if [ ! -f "$script_path" ]; then
            missing="${missing}${script} "
        elif [ ! -x "$script_path" ]; then
            not_executable="${not_executable}${script} "
        else
            # Check syntax
            if ! bash -n "$script_path" 2>/dev/null; then
                syntax_errors="${syntax_errors}${script} "
            fi
        fi
    done
    
    if [ -n "$missing" ]; then
        echo "FAIL"
        echo "  Missing scripts: $missing"
        return 1
    fi
    
    if [ -n "$not_executable" ]; then
        echo "WARN"
        echo "  Not executable: $not_executable"
        return 2
    fi
    
    if [ -n "$syntax_errors" ]; then
        echo "FAIL"
        echo "  Syntax errors: $syntax_errors"
        return 1
    fi
    
    echo "PASS"
}

check_coverage_internal() {
    local skill="$1"
    local skill_file="${SKILLS_DIR}/${skill}/SKILL.md"
    
    # Check if skill has mode associations
    if grep -qE "(Mode:|mode:|execution.*mode)" "$skill_file" 2>/dev/null; then
        echo "PASS"
        return 0
    fi
    
    # Check if skill is in orchestrator routing table
    local orchestrator_file="${SKILLS_DIR}/production-grade/SKILL.md"
    if [ -f "$orchestrator_file" ]; then
        if grep -qi "$skill" "$orchestrator_file" 2>/dev/null; then
            echo "PASS"
            return 0
        fi
    fi
    
    echo "WARN"
    echo "  No mode association found"
    return 2
}

#-------------------------------------------------------------------------------
# Check All Skills
#-------------------------------------------------------------------------------

check_all_skills() {
    log_info "Running health checks on all skills..."
    echo ""
    
    local skills
    skills=$(get_skills)
    
    TOTAL_SKILLS=$(echo "$skills" | tr ',' '\n' | wc -l | tr -d ' ')
    CHECKED_SKILLS=0
    PASS_COUNT=0
    WARN_COUNT=0
    FAIL_COUNT=0
    
    echo "───────────────────────────────────────────────────────────────────────────────"
    printf "  %-25s %-12s %-12s %-12s %-12s %-12s\n" \
        "Skill" "Schema" "Deps" "Templates" "Protocols" "Scripts"
    echo "───────────────────────────────────────────────────────────────────────────────"
    
    local results_json="["
    local first_result=true
    
    for skill in $(echo "$skills" | tr ',' '\n'); do
        [ -z "$skill" ] && continue
        
        CHECKED_SKILLS=$((CHECKED_SKILLS + 1))
        
        local schema_result
        local deps_result
        local templates_result
        local protocols_result
        local scripts_result
        
        schema_result=$(check_schema "$skill" 2>&1)
        local schema_status=$(echo "$schema_result" | head -1)
        
        deps_result=$(check_dependencies "$skill" 2>&1)
        local deps_status=$(echo "$deps_result" | head -1)
        
        templates_result=$(check_templates "$skill" 2>&1)
        local templates_status=$(echo "$templates_result" | head -1)
        
        protocols_result=$(check_protocols "$skill" 2>&1)
        local protocols_status=$(echo "$protocols_result" | head -1)
        
        scripts_result=$(check_scripts "$skill" 2>&1)
        local scripts_status=$(echo "$scripts_result" | head -1)
        
        # Determine overall status
        local overall_status="PASS"
        local severity="LOW"
        
        for status in "$schema_status" "$deps_status" "$templates_status" "$protocols_status" "$scripts_status"; do
            case "$status" in
                FAIL)
                    overall_status="FAIL"
                    severity="HIGH"
                    break
                    ;;
                WARN)
                    if [ "$overall_status" != "FAIL" ]; then
                        overall_status="WARN"
                        severity="MEDIUM"
                    fi
                    ;;
            esac
        done
        
        # Format output
        case "$schema_status" in
            PASS) schema_display="${GREEN}✓${NC}" ;;
            FAIL) schema_display="${RED}✗${NC}" ;;
            WARN) schema_display="${YELLOW}⚠${NC}" ;;
        esac
        
        case "$deps_status" in
            PASS) deps_display="${GREEN}✓${NC}" ;;
            FAIL) deps_display="${RED}✗${NC}" ;;
            WARN) deps_display="${YELLOW}⚠${NC}" ;;
        esac
        
        case "$templates_status" in
            PASS) templates_display="${GREEN}✓${NC}" ;;
            FAIL) templates_display="${RED}✗${NC}" ;;
            WARN) templates_display="${YELLOW}⚠${NC}" ;;
        esac
        
        case "$protocols_status" in
            PASS) protocols_display="${GREEN}✓${NC}" ;;
            FAIL) protocols_display="${RED}✗${NC}" ;;
            WARN) protocols_display="${YELLOW}⚠${NC}" ;;
        esac
        
        case "$scripts_status" in
            PASS) scripts_display="${GREEN}✓${NC}" ;;
            FAIL) scripts_display="${RED}✗${NC}" ;;
            WARN) scripts_display="${YELLOW}⚠${NC}" ;;
        esac
        
        printf "  %-25s %-12b %-12b %-12b %-12b %-12b\n" \
            "$skill" "$schema_display" "$deps_display" "$templates_display" "$protocols_display" "$scripts_display"
        
        # Update counters
        case "$overall_status" in
            PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
            WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
            FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
        esac
    done
    
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo ""
    
    # Summary
    echo "SUMMARY"
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo "  Total Skills:  ${TOTAL_SKILLS}"
    echo "  Checked:       ${CHECKED_SKILLS}"
    echo -e "  ${GREEN}Passed: ${PASS_COUNT}${NC}"
    echo -e "  ${YELLOW}Warnings: ${WARN_COUNT}${NC}"
    echo -e "  ${RED}Failures: ${FAIL_COUNT}${NC}"
    echo ""
    
    # Generate JSON report
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "${HEALTH_REPORT}" <<EOF
{
    "timestamp": "${timestamp}",
    "summary": {
        "total_skills": ${TOTAL_SKILLS},
        "checked": ${CHECKED_SKILLS},
        "passed": ${PASS_COUNT},
        "warnings": ${WARN_COUNT},
        "failures": ${FAIL_COUNT}
    }
}
EOF
    
    log_success "Health report written to ${HEALTH_REPORT}"
}

#-------------------------------------------------------------------------------
# Mode Coverage Check
#-------------------------------------------------------------------------------

check_mode_coverage() {
    log_info "Checking mode coverage..."
    echo ""
    
    local expected_modes=(
        "Full Build" "Feature" "Debug" "Review" "Test" "Architect"
        "Design" "Mobile" "Game Build" "XR Build" "Ship" "Document"
        "Explore" "Research" "Optimize" "Marketing" "Grow" "Analyze"
        "Prompt" "AI Build" "Migrate" "Autonomous" "Goal" "Custom"
    )
    
    local orchestrator_file="${SKILLS_DIR}/production-grade/SKILL.md"
    
    echo "───────────────────────────────────────────────────────────────────────────────"
    echo "  MODE COVERAGE REPORT"
    echo "───────────────────────────────────────────────────────────────────────────────"
    
    local covered_count=0
    local total_count=${#expected_modes[@]}
    
    for mode in "${expected_modes[@]}"; do
        local mode_lower
        mode_lower=$(echo "$mode" | tr '[:upper:]' '[:lower:]')
        
        local found=false
        
        # Check orchestrator
        if [ -f "$orchestrator_file" ]; then
            if grep -qi "$mode_lower\|$mode" "$orchestrator_file" 2>/dev/null; then
                found=true
            fi
        fi
        
        # Check all skill files
        if [ "$found" = false ]; then
            for skill_file in "${SKILLS_DIR}"/*/SKILL.md; do
                if grep -qi "$mode_lower\|$mode" "$skill_file" 2>/dev/null; then
                    found=true
                    break
                fi
            done
        fi
        
        if [ "$found" = true ]; then
            covered_count=$((covered_count + 1))
            echo -e "    ${GREEN}✓${NC} $mode"
        else
            echo -e "    ${RED}✗${NC} $mode"
        fi
    done
    
    echo ""
    echo "───────────────────────────────────────────────────────────────────────────────"
    
    local coverage_pct=0
    if [ $total_count -gt 0 ]; then
        coverage_pct=$(echo "scale=2; ($covered_count * 100) / $total_count" | bc 2>/dev/null || echo "0")
    fi
    
    echo "  Mode Coverage: ${coverage_pct}% ($covered_count/$total_count)"
    echo ""
    
    if [ $covered_count -lt $total_count ]; then
        log_warning "$((total_count - covered_count)) modes are not covered by any skill"
        return 1
    fi
    
    log_success "All modes are covered"
    return 0
}

#-------------------------------------------------------------------------------
# Auto-fix
#-------------------------------------------------------------------------------

auto_fix() {
    log_info "Running auto-fix for common issues..."
    echo ""
    
    local fixed=0
    
    # Fix non-executable scripts
    for script in "${SCRIPT_DIR}"/scripts/*.sh; do
        if [ -f "$script" ] && [ ! -x "$script" ]; then
            chmod +x "$script"
            echo "  ${GREEN}Fixed:${NC} Made executable: $(basename "$script")"
            fixed=$((fixed + 1))
        fi
    done
    
    # Fix missing SKILL.md files
    local skills
    skills=$(get_skills)
    
    echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
        [ -z "$skill" ] && continue
        
        local skill_dir="${SKILLS_DIR}/${skill}"
        local skill_file="${skill_dir}/SKILL.md"
        
        if [ ! -f "$skill_file" ]; then
            cat > "$skill_file" <<EOF
# $skill

> **Description:** Skill for $skill tasks

## Overview

This skill handles $skill-related tasks.

## Usage

This skill is invoked through the Forgewright orchestrator.

## Dependencies

- [plan-quality-loop](../_shared/protocols/plan-quality-loop.md)
EOF
            echo "  ${YELLOW}Created:${NC} Missing SKILL.md for: $skill"
            fixed=$((fixed + 1))
        fi
    done
    
    if [ $fixed -gt 0 ]; then
        log_success "Auto-fixed $fixed issues"
    else
        log_info "No auto-fixable issues found"
    fi
}

#-------------------------------------------------------------------------------
# Usage
#-------------------------------------------------------------------------------

usage() {
    cat <<EOF
Forgewright Skill Health Checker v1.1.0

USAGE:
    $0 [command] [options]

COMMANDS:
    check           Run all health checks (default)
    check schema    Check schema validation only
    check coverage  Check mode coverage
    
    fix             Auto-fix common issues
    report          Generate detailed report
    
    help            Show this help message

OPTIONS:
    --verbose       Show detailed output

EXAMPLES:
    # Run all health checks
    $0 check
    
    # Check mode coverage
    $0 check coverage
    
    # Auto-fix issues
    $0 fix
    
    # Show report
    $0 report

EOF
}

#-------------------------------------------------------------------------------
# Main Entry Point
#-------------------------------------------------------------------------------

main() {
    local command="${1:-check}"
    local check_type=""
    
    shift 2>/dev/null || true
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verbose) VERBOSE=1; shift ;;
            check|schema|coverage)
                check_type="$1"; shift ;;
            fix|report|help|--help|-h)
                command="$1"; shift ;;
            *) shift ;;
        esac
    done
    
    case "$command" in
        check)
            if [ -n "$check_type" ]; then
                case "$check_type" in
                    schema)
                        log_info "Checking schema for all skills..."
                        local skills
                        skills=$(get_skills)
                        echo "$skills" | tr ',' '\n' | while IFS= read -r skill; do
                            [ -z "$skill" ] && continue
                            local result
                            result=$(check_schema "$skill" 2>&1)
                            echo "$skill: $result"
                        done
                        ;;
                    coverage)
                        check_mode_coverage
                        ;;
                    *)
                        log_info "Checking $check_type..."
                        ;;
                esac
            else
                check_all_skills
                check_mode_coverage
            fi
            ;;
        fix)
            auto_fix
            ;;
        report)
            if [ -f "${HEALTH_REPORT}" ]; then
                cat "${HEALTH_REPORT}"
            else
                log_error "No health report found. Run 'check' first."
                exit 1
            fi
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
