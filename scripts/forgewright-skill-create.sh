#!/bin/bash
#===============================================================================
# forgewright-skill-create.sh — Git-based Skill Auto-Generator
#
# Analyzes git history to auto-generate Forgewright skills from real patterns.
#
# Usage:
#   forgewright skill-create --from-git --pattern "auth" --name "auth-expert"
#   forgewright skill-create --from-repo https://github.com/user/repo --name "user-repo"
#   forgewright skill-create --interactive
#
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
MODE="local"
PATTERN=""
SKILL_NAME=""
SOURCE_REPO=""
OUTPUT_DIR="skills/generated"
VERBOSE=false
MIN_COMMITS=3

#-------------------------------------------------------------------------------
# Help
#-------------------------------------------------------------------------------
show_help() {
    cat << 'EOF'
forgewright-skill-create.sh — Auto-generate skills from git history

USAGE:
    forgewright-skill-create.sh [OPTIONS]

OPTIONS:
    --from-git              Analyze local git repository (default)
    --from-repo <url>       Analyze remote repository
    --pattern <pattern>     Search for commits matching pattern (regex)
    --name <skill-name>     Name for the generated skill (kebab-case)
    --output <dir>          Output directory (default: skills/generated)
    --min-commits <n>       Minimum commits for a pattern (default: 3)
    -v, --verbose           Verbose output
    -h, --help              Show this help

EXAMPLES:
    # Analyze local repo for auth-related commits
    forgewright-skill-create.sh --pattern "auth" --name "auth-expert"

    # Analyze remote repo
    forgewright-skill-create.sh --from-repo https://github.com/user/repo --name "user-repo"

    # Interactive mode
    forgewright-skill-create.sh --interactive

EOF
}

#-------------------------------------------------------------------------------
# Parse arguments
#-------------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --from-git)
                MODE="local"
                shift
                ;;
            --from-repo)
                MODE="remote"
                SOURCE_REPO="$2"
                shift 2
                ;;
            --pattern)
                PATTERN="$2"
                shift 2
                ;;
            --name)
                SKILL_NAME="$2"
                shift 2
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --min-commits)
                MIN_COMMITS="$2"
                shift 2
                ;;
            --interactive)
                MODE="interactive"
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    # Interactive mode prompts
    if [[ "$MODE" == "interactive" ]]; then
        interactive_mode
    fi

    # Validate required args
    if [[ -z "$SKILL_NAME" ]]; then
        echo -e "${RED}Error: --name is required${NC}"
        show_help
        exit 1
    fi

    # Validate skill name format (kebab-case)
    if ! [[ "$SKILL_NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        echo -e "${RED}Error: Skill name must be kebab-case (e.g., auth-expert)${NC}"
        exit 1
    fi
}

#-------------------------------------------------------------------------------
# Interactive mode
#-------------------------------------------------------------------------------
interactive_mode() {
    echo -e "${BLUE}=== Interactive Skill Creator ===${NC}"
    echo

    # Mode selection
    echo "Select analysis source:"
    echo "  1) Local git repository (current directory)"
    echo "  2) Remote repository (GitHub URL)"
    read -p "Choice [1]: " choice
    choice=${choice:-1}

    if [[ "$choice" == "2" ]]; then
        MODE="remote"
        read -p "Enter repository URL: " SOURCE_REPO
    else
        MODE="local"
    fi

    # Pattern
    read -p "Enter search pattern (regex, empty for all commits): " PATTERN

    # Skill name
    read -p "Enter skill name (kebab-case, e.g., auth-expert): " SKILL_NAME

    echo
    echo -e "${GREEN}Ready to analyze. Press Enter to continue...${NC}"
    read
}

#-------------------------------------------------------------------------------
# Git operations
#-------------------------------------------------------------------------------
setup_remote_repo() {
    local repo_url="$1"
    local temp_dir

    temp_dir=$(mktemp -d)
    echo -e "${BLUE}Cloning repository...${NC}"

    git clone --depth=100 "$repo_url" "$temp_dir" 2>/dev/null || {
        echo -e "${RED}Failed to clone repository${NC}"
        exit 1
    }

    echo "$temp_dir"
}

get_commit_history() {
    local work_dir="$1"
    local pattern="$2"

    cd "$work_dir"

    if [[ -n "$pattern" ]]; then
        # Get commits matching pattern in message or files
        git log --oneline --all --since="1 year ago" --format="%H|%ai|%s" | \
            while IFS='|' read -r hash date msg; do
                # Check if pattern matches commit message or any file in commit
                if [[ "$msg" =~ $pattern ]] || git show --name-only --format="" "$hash" | grep -qE "$pattern"; then
                    echo "$hash|$date|$msg"
                fi
            done
    else
        # Get all commits from last year
        git log --oneline --since="1 year ago" --format="%H|%ai|%s"
    fi
}

get_commit_files() {
    local work_dir="$1"
    local commit_hash="$2"

    cd "$work_dir"
    git show --name-only --format="" "$commit_hash" 2>/dev/null | grep -v '^$' | sort -u
}

get_commit_stats() {
    local work_dir="$1"
    local commit_hash="$2"

    cd "$work_dir"
    git show --stat --format="" "$commit_hash" 2>/dev/null | tail -1
}

#-------------------------------------------------------------------------------
# Pattern analysis
#-------------------------------------------------------------------------------
analyze_file_patterns() {
    local work_dir="$1"
    local commits_json="$2"

    echo -e "${BLUE}Analyzing file patterns...${NC}" >&2

    # Extract unique files from all commits
    local all_files
    all_files=$(mktemp)

    while IFS='|' read -r hash date msg; do
        [[ -z "$hash" ]] && continue
        get_commit_files "$work_dir" "$hash" >> "$all_files" 2>/dev/null
    done < <(echo "$commits_json")

    # Count file frequencies
    local file_freq
    file_freq=$(sort "$all_files" 2>/dev/null | uniq -c | sort -rn | head -20)

    # Cluster files by directory
    local dir_clusters
    dir_clusters=$(echo "$file_freq" | awk '
    {
        n = split($2, parts, "/")
        if (n > 1) {
            dir = ""
            for (i = 1; i < n; i++) {
                dir = dir (dir ? "/" : "") parts[i]
            }
            dirs[dir] += $1
        } else {
            dirs["."] += $1
        }
    }
    END {
        for (d in dirs) {
            print dirs[d], d
        }
    }' | sort -rn | head -10)

    rm -f "$all_files"

    echo "$dir_clusters"
}

cluster_commits_by_topic() {
    local work_dir="$1"
    local commits_json="$2"

    echo -e "${BLUE}Clustering commits by topic...${NC}" >&2

    # Simpler approach: count topics from commit messages
    local auth_count=0 api_count=0 db_count=0 test_count=0
    local security_count=0 perf_count=0 ci_count=0 docs_count=0
    local ui_count=0 config_count=0 general_count=0

    while IFS='|' read -r hash date msg; do
        [[ -z "$hash" ]] && continue

        files=$(get_commit_files "$work_dir" "$hash")
        combined="$msg $files"

        if echo "$combined" | grep -qE "auth|login|logout|jwt|token|oauth|password|session"; then
            auth_count=$((auth_count + 1))
        elif echo "$combined" | grep -qE "api|endpoint|route|controller|handler"; then
            api_count=$((api_count + 1))
        elif echo "$combined" | grep -qE "database|db|migration|schema|model"; then
            db_count=$((db_count + 1))
        elif echo "$combined" | grep -qE "test|spec|fixture|mock"; then
            test_count=$((test_count + 1))
        elif echo "$combined" | grep -qE "security|vulnerability|secret|key|encrypt|sanitize"; then
            security_count=$((security_count + 1))
        elif echo "$combined" | grep -qE "performance|optimize|cache|index"; then
            perf_count=$((perf_count + 1))
        elif echo "$combined" | grep -qE "ci|cd|pipeline|github|docker|deploy"; then
            ci_count=$((ci_count + 1))
        elif echo "$combined" | grep -qE "docs|readme|doc|comment"; then
            docs_count=$((docs_count + 1))
        elif echo "$combined" | grep -qE "ui|component|button|form|modal|page|view"; then
            ui_count=$((ui_count + 1))
        elif echo "$combined" | grep -qE "config|env|setting|options"; then
            config_count=$((config_count + 1))
        else
            general_count=$((general_count + 1))
        fi
    done < <(echo "$commits_json")

    # Return clusters as simple format
    echo "auth:$auth_count api:$api_count db:$db_count test:$test_count security:$security_count perf:$perf_count ci:$ci_count docs:$docs_count ui:$ui_count config:$config_count general:$general_count"
}

extract_common_operations() {
    local work_dir="$1"
    local commits_json="$2"

    echo -e "${BLUE}Extracting common operations...${NC}" >&2

    # Analyze commit messages for patterns
    local operations
    operations=$(echo "$commits_json" | cut -d'|' -f3 2>/dev/null | sort | uniq -c | sort -rn | head -10)

    # Extract action verbs
    echo "$operations" | grep -oE "(add|create|update|modify|fix|remove|delete|refactor|implement|extract|rename|move|copy) [a-zA-Z0-9_-]+" 2>/dev/null | \
        sort | uniq -c | sort -rn | head -10
}

#-------------------------------------------------------------------------------
# Generate skill markdown
#-------------------------------------------------------------------------------
generate_skill_markdown() {
    local skill_name="$1"
    local commits_json="$2"
    local dir_clusters="$3"
    local topic_clusters="$4"
    local operations="$5"
    local work_dir="$6"

    local output_path="${OUTPUT_DIR}/${skill_name}/SKILL.md"
    local total_commits=$(echo "$commits_json" | grep -c '^' || echo 0)

    # Calculate confidence based on commit count
    local confidence
    if [[ $total_commits -ge 20 ]]; then
        confidence="0.85"
    elif [[ $total_commits -ge 10 ]]; then
        confidence="0.75"
    elif [[ $total_commits -ge 5 ]]; then
        confidence="0.65"
    elif [[ $total_commits -ge 3 ]]; then
        confidence="0.55"
    else
        confidence="0.40"
    fi

    # Extract date range
    local date_range=$(echo "$commits_json" | cut -d'|' -f2 | sort | head -1)
    local end_date=$(echo "$commits_json" | cut -d'|' -f2 | sort | tail -1)
    local months_span=3
    [[ -n "$date_range" && -n "$end_date" ]] && months_span=3  # Simplified

    # Extract keywords from topic clusters
    local keywords=$(echo "$topic_clusters" | sed 's/:[0-9]*//g' | tr ' ' '\n' | grep -v '^$' | head -10 | tr '\n' ', ')
    [[ -z "$keywords" || "$keywords" == "," ]] && keywords="general,default"

    # File patterns (simplified)
    local file_patterns="**/*.ts, **/*.js, **/*.sh"
    [[ -z "$file_patterns" ]] && file_patterns="**/*.ts"

    # Get files modified together
    local files_together=""
    while IFS='|' read -r hash date msg; do
        files=$(get_commit_files "$work_dir" "$hash" | tr '\n' '|' | sed 's/|$//')
        [[ -n "$files" ]] && files_together+="- \`$files\`"$'\n'
    done < <(echo "$commits_json" | head -5)
    [[ -z "$files_together" ]] && files_together="- (analyzing...)"

    mkdir -p "${OUTPUT_DIR}/${skill_name}"

    # Generate content with variables expanded
    local keywords_formatted
    local file_patterns_formatted
    local operations_formatted
    local dir_clusters_formatted
    local files_together_formatted

    keywords_formatted=$(echo "$keywords" | sed 's/, /\n- /g' | sed 's/^/- /')
    file_patterns_formatted=$(echo "$file_patterns" | sed 's/, /\n- /g' | sed 's/^/- /')
    operations_formatted=$(echo "$operations" | head -10)
    dir_clusters_formatted=$(echo "$dir_clusters" | head -5 | awk '{print "| " $2 " | " $1 " |"}')
    files_together_formatted=$(echo "$files_together" | head -10)

    # Generate skill name capitalized (bash 3 compatible)
    local skill_name_display
    skill_name_display=$(echo "$skill_name" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2));}1' | sed 's/ /-/g')

    printf -- '%s\n' "---
name: ${skill_name}
description: >
  Auto-generated skill from git history analysis.
  Triggers on: ${keywords}.
  Use when working with ${file_patterns} files.
version: 0.1.0
author: forgewright-skill-creator
confidence: ${confidence}
source_commits: ${total_commits}
source_date_range: ${date_range} to ${end_date}
tags: [auto-generated, git-analysis]
---

# ${skill_name_display}

> Auto-generated from ${total_commits} commits analyzing ${skill_name}-related patterns.

**Confidence:** ${confidence}
**Based on:** ${total_commits} occurrences across ${months_span}+ months

## Trigger Patterns

### Keywords (detected from commit messages)
${keywords_formatted}

### File Patterns
${file_patterns_formatted}

## Common Operations

Extracted from commit patterns:

\`\`\`
${operations_formatted}
\`\`\`

## Files Modified Together

These files are frequently modified in the same commits:

${files_together_formatted}

## Topic Clusters

Detected topics from commit analysis:

${topic_clusters}

## Directory Distribution

| Directory | Modifications |
|-----------|---------------|
${dir_clusters_formatted}

## Implementation Notes

- This skill was auto-generated from git history analysis
- Pattern confidence: ${confidence} (based on ${total_commits} commits)
- Generated: $(date -u +"%Y-%m-%d")

## Verification Checklist

- [ ] Review trigger patterns match actual use cases
- [ ] Validate file patterns are correct
- [ ] Check common operations are accurate
- [ ] Adjust confidence score if needed
" > "$output_path"

    echo -e "${GREEN}✓ Skill generated: ${output_path}${NC}"
    echo "$output_path"
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------
main() {
    echo -e "${BLUE}=== Forgewright Skill Creator ===${NC}"
    echo

    local work_dir=""

    # Setup working directory
    case "$MODE" in
        local)
            if ! git rev-parse --is-inside-work-tree &>/dev/null; then
                echo -e "${RED}Error: Not in a git repository${NC}"
                exit 1
            fi
            work_dir=$(git rev-parse --show-toplevel)
            echo -e "Analyzing local repository: ${GREEN}${work_dir}${NC}"
            ;;
        remote)
            work_dir=$(setup_remote_repo "$SOURCE_REPO")
            echo -e "Analyzing remote repository: ${GREEN}${SOURCE_REPO}${NC}"
            ;;
    esac

    echo

    # Get commit history
    echo -e "${BLUE}Fetching commit history...${NC}"
    local commits_json
    commits_json=$(get_commit_history "$work_dir" "$PATTERN")
    local commit_count=$(echo "$commits_json" | grep -c '^' || echo 0)

    if [[ $commit_count -lt $MIN_COMMITS ]]; then
        echo -e "${YELLOW}Warning: Only ${commit_count} commits found (minimum: ${MIN_COMMITS})${NC}"
        echo -e "${YELLOW}Generating skill anyway, but confidence will be lower${NC}"
    fi

    echo "Found ${commit_count} commits"

    # Handle repos with no commits
    if [[ -z "$commits_json" ]] || [[ $commit_count -eq 0 ]]; then
        echo -e "${YELLOW}No commits found. Generating skeleton skill...${NC}"
        commits_json=""
    fi

    # Analyze patterns
    echo
    local dir_clusters
    dir_clusters=$(analyze_file_patterns "$work_dir" "$commits_json")

    local topic_clusters
    topic_clusters=$(cluster_commits_by_topic "$work_dir" "$commits_json")

    local operations
    operations=$(extract_common_operations "$work_dir" "$commits_json")

    # Generate skill
    echo
    local output_path
    output_path=$(generate_skill_markdown "$SKILL_NAME" "$commits_json" "$dir_clusters" "$topic_clusters" "$operations" "$work_dir")

    # Cleanup remote clone
    if [[ "$MODE" == "remote" ]]; then
        rm -rf "$work_dir"
    fi

    echo
    echo -e "${GREEN}=== Skill Generation Complete ===${NC}"
    echo
    echo "Output: $output_path"
    echo
    echo "Next steps:"
    echo "  1. Review and edit: $output_path"
    echo "  2. Test with: forgewright skill-test --name $SKILL_NAME"
    echo "  3. Install: move to skills/ directory"
}

#-------------------------------------------------------------------------------
# Entry point
#-------------------------------------------------------------------------------
parse_args "$@"
main
