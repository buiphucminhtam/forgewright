#!/bin/bash
#===============================================================================
# Forgewright Metrics Collector
#===============================================================================
# Purpose: Collect and track session metrics for Forgewright performance monitoring
# Version: 1.0.0
# Created: 2026-05-29
# Phase: 3.2
#===============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
METRICS_DIR="${PROJECT_DIR}/.forgewright/metrics"
METRICS_FILE="${METRICS_DIR}/sessions.jsonl"
DAILY_FILE="${METRICS_DIR}/daily-$(date +%Y-%m-%d).json"
WEEKLY_FILE="${METRICS_DIR}/weekly-$(date +%G-W%V).json"
SUMMARY_FILE="${METRICS_DIR}/summary.json"

# Ensure metrics directory exists
mkdir -p "${METRICS_DIR}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#-------------------------------------------------------------------------------
# Utility Functions
#-------------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

#-------------------------------------------------------------------------------
# Metric Collection Functions
#-------------------------------------------------------------------------------

collect_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

collect_session_id() {
    # Generate unique session ID based on timestamp
    date +"%Y%m%d-%H%M%S"
}

collect_latency_metrics() {
    local mode="${1:-unknown}"
    local start_time="${2:-$(date +%s.%N)}"
    local end_time="${3:-$(date +%s.%N)}"
    
    local duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
    
    cat <<EOF
{
    "metric": "latency",
    "mode": "$mode",
    "duration_ms": $duration,
    "timestamp": "$(collect_timestamp)"
}
EOF
}

collect_token_metrics() {
    local input_tokens="${1:-0}"
    local output_tokens="${2:-0}"
    local context_tokens="${3:-0}"
    
    local total_tokens=$((input_tokens + output_tokens))
    local compression_ratio=0
    if [ "$input_tokens" -gt 0 ]; then
        compression_ratio=$(echo "scale=4; $output_tokens / $input_tokens" | bc 2>/dev/null || echo "0")
    fi
    
    cat <<EOF
{
    "metric": "tokens",
    "input": $input_tokens,
    "output": $output_tokens,
    "total": $total_tokens,
    "compression_ratio": $compression_ratio,
    "context_tokens": $context_tokens,
    "timestamp": "$(collect_timestamp)"
}
EOF
}

collect_quality_metrics() {
    local plan_score="${1:-0}"
    local test_pass_rate="${2:-0}"
    local review_score="${3:-0}"
    
    cat <<EOF
{
    "metric": "quality",
    "plan_score": $plan_score,
    "test_pass_rate": $test_pass_rate,
    "review_score": $review_score,
    "timestamp": "$(collect_timestamp)"
}
EOF
}

collect_asip_metrics() {
    local metrics_file="${METRICS_DIR}/asip-metrics.json"
    
    if [ -f "$metrics_file" ]; then
        cat "$metrics_file"
    else
        cat <<EOF
{
    "metric": "asip",
    "lessonsLearned": 0,
    "sessionsWithEvolution": 0,
    "lastUpdated": "$(collect_timestamp)"
}
EOF
    fi
}

collect_reliability_metrics() {
    local error_count="${1:-0}"
    local retry_count="${2:-0}"
    local total_operations="${3:-1}"
    
    local error_rate=0
    if [ "$total_operations" -gt 0 ]; then
        error_rate=$(echo "scale=4; $error_count / $total_operations" | bc 2>/dev/null || echo "0")
    fi
    
    cat <<EOF
{
    "metric": "reliability",
    "error_count": $error_count,
    "retry_count": $retry_count,
    "error_rate": $error_rate,
    "total_operations": $total_operations,
    "timestamp": "$(collect_timestamp)"
}
EOF
}

collect_skill_metrics() {
    local skill_count
    local script_count
    local protocol_count
    
    # Count skills
    skill_count=$(find "${SCRIPT_DIR}/skills" -maxdepth 1 -type d -name '*-engineer' -o -name '*-designer' -o -name '*-architect' -o -name '*-manager' -o -name '*-reviewer' -o -name '*-writer' -o -name '*-researcher' -o -name '*-tester' -o -name '*-marketer' -o -name '*-optimiz*' -o -name '*-dispatcher' -o -name '*-generator' -o -name '*-maker' -o -name '*-agent' -o -name '*-scraper' 2>/dev/null | wc -l || echo "0")
    
    # Count scripts
    script_count=$(find "${SCRIPT_DIR}/scripts" -maxdepth 1 -name '*.sh' 2>/dev/null | wc -l || echo "0")
    
    # Count protocols
    protocol_count=$(find "${SCRIPT_DIR}/skills/_shared/protocols" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l || echo "0")
    
    cat <<EOF
{
    "metric": "forgewright",
    "skill_count": $skill_count,
    "script_count": $script_count,
    "protocol_count": $protocol_count,
    "timestamp": "$(collect_timestamp)"
}
EOF
}

#-------------------------------------------------------------------------------
# Session Recording
#-------------------------------------------------------------------------------

record_session() {
    local mode="${1:-unknown}"
    local plan_score="${2:-0}"
    local input_tokens="${3:-0}"
    local output_tokens="${4:-0}"
    local error_count="${5:-0}"
    local retry_count="${6:-0}"
    local session_duration="${7:-0}"
    
    local session_id=$(collect_session_id)
    local timestamp=$(collect_timestamp)
    
    local entry=$(cat <<EOF
{
    "session_id": "$session_id",
    "mode": "$mode",
    "plan_score": $plan_score,
    "input_tokens": $input_tokens,
    "output_tokens": $output_tokens,
    "total_tokens": $((input_tokens + output_tokens)),
    "error_count": $error_count,
    "retry_count": $retry_count,
    "session_duration_ms": $session_duration,
    "timestamp": "$timestamp"
}
EOF
)
    
    echo "$entry" >> "${METRICS_FILE}"
    log_success "Session recorded: $session_id"
}

#-------------------------------------------------------------------------------
# Aggregation Functions
#-------------------------------------------------------------------------------

aggregate_daily() {
    local date="${1:-$(date +%Y-%m-%d)}"
    local output_file="${METRICS_DIR}/daily-${date}.json"
    
    if [ ! -f "${METRICS_FILE}" ]; then
        log_warning "No sessions file found"
        return 1
    fi
    
    local sessions=$(grep "\"timestamp\": \"${date}" "${METRICS_FILE}" 2>/dev/null | wc -l || echo "0")
    local avg_plan_score=0
    local total_tokens=0
    local total_errors=0
    local mode_counts=$(grep "\"timestamp\": \"${date}" "${METRICS_FILE}" 2>/dev/null | \
        jq -r '.mode' 2>/dev/null | sort | uniq -c | \
        jq -s 'map({mode: .[0], count: .[1]})' 2>/dev/null || echo "[]")
    
    # Calculate averages from today's sessions
    local today_sessions=$(grep "\"timestamp\": \"${date}" "${METRICS_FILE}" 2>/dev/null || echo "")
    if [ -n "$today_sessions" ]; then
        avg_plan_score=$(echo "$today_sessions" | jq -r '.plan_score' 2>/dev/null | \
            awk '{sum+=$1; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}')
        total_tokens=$(echo "$today_sessions" | jq -r '.total_tokens' 2>/dev/null | \
            awk '{sum+=$1} END {print sum}')
        total_errors=$(echo "$today_sessions" | jq -r '.error_count' 2>/dev/null | \
            awk '{sum+=$1} END {print sum}')
    fi
    
    cat <<EOF > "${output_file}"
{
    "date": "$date",
    "sessions": $sessions,
    "avg_plan_score": $avg_plan_score,
    "total_tokens": $total_tokens,
    "total_errors": $total_errors,
    "mode_distribution": $mode_counts,
    "generated_at": "$(collect_timestamp)"
}
EOF
    
    log_success "Daily metrics written to ${output_file}"
    cat "${output_file}"
}

aggregate_weekly() {
    local week="${1:-$(date +%G-W%V)}"
    local output_file="${METRICS_DIR}/weekly-${week}.json"
    
    # Find all daily files for this week
    local week_files=$(find "${METRICS_DIR}" -name "daily-*.json" -newer "${METRICS_DIR}/weekly-${week}.json" 2>/dev/null || echo "")
    
    if [ -z "$week_files" ]; then
        log_warning "No daily files found for week $week"
        return 1
    fi
    
    local total_sessions=0
    local avg_plan_score=0
    local total_tokens=0
    local total_errors=0
    
    for file in $week_files; do
        total_sessions=$((total_sessions + $(jq -r '.sessions' "$file" 2>/dev/null || echo "0")))
        avg_plan_score=$(echo "$avg_plan_score + $(jq -r '.avg_plan_score' "$file" 2>/dev/null || echo "0")" | bc -l 2>/dev/null || echo "$avg_plan_score")
        total_tokens=$((total_tokens + $(jq -r '.total_tokens' "$file" 2>/dev/null || echo "0")))
        total_errors=$((total_errors + $(jq -r '.total_errors' "$file" 2>/dev/null || echo "0")))
    done
    
    local days_count=$(echo "$week_files" | wc -w)
    if [ "$days_count" -gt 0 ]; then
        avg_plan_score=$(echo "scale=2; $avg_plan_score / $days_count" | bc -l 2>/dev/null || echo "0")
    fi
    
    cat <<EOF > "${output_file}"
{
    "week": "$week",
    "total_sessions": $total_sessions,
    "avg_plan_score": $avg_plan_score,
    "total_tokens": $total_tokens,
    "total_errors": $total_errors,
    "days_count": $days_count,
    "generated_at": "$(collect_timestamp)"
}
EOF
    
    log_success "Weekly metrics written to ${output_file}"
    cat "${output_file}"
}

#-------------------------------------------------------------------------------
# Dashboard Output
#-------------------------------------------------------------------------------

show_dashboard() {
    local show_details="${1:-false}"
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║                    FORGEWRIGHT METRICS DASHBOARD                      ║"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    
    # Forgewright Stats
    local skill_count script_count protocol_count
    skill_count=$(find "${SCRIPT_DIR}/skills" -maxdepth 1 -type d 2>/dev/null | wc -l | awk '{print $1-1}')
    script_count=$(find "${SCRIPT_DIR}/scripts" -maxdepth 1 -name '*.sh' 2>/dev/null | wc -l)
    protocol_count=$(find "${SCRIPT_DIR}/skills/_shared/protocols" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
    
    echo "║ FORGEWRIGHT STATUS                                                     ║"
    echo "║   Skills: $skill_count  │  Scripts: $script_count  │  Protocols: $protocol_count         ║"
    
    # Session Stats
    local total_sessions=0
    local avg_plan_score=0
    if [ -f "${METRICS_FILE}" ]; then
        total_sessions=$(wc -l < "${METRICS_FILE}" 2>/dev/null || echo "0")
        avg_plan_score=$(awk -F'"plan_score": ' '{sum+=$2; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}' "${METRICS_FILE}" 2>/dev/null || echo "0")
    fi
    echo "║ SESSION STATISTICS                                                     ║"
    echo "║   Total Sessions: $total_sessions  │  Avg Plan Score: $avg_plan_score                         ║"
    
    # Recent Activity
    if [ -f "${METRICS_FILE}" ]; then
        echo "║ RECENT SESSIONS (Last 5)                                              ║"
        tail -5 "${METRICS_FILE}" 2>/dev/null | while IFS= read -r line; do
            local mode=$(echo "$line" | jq -r '.mode' 2>/dev/null || echo "?")
            local score=$(echo "$line" | jq -r '.plan_score' 2>/dev/null || echo "?")
            local ts=$(echo "$line" | jq -r '.timestamp' 2>/dev/null | cut -d'T' -f2 | cut -d'Z' -f1 || echo "?")
            printf "║   %s │ Score: %s │ %s                                           ║\n" "$mode" "$score" "$ts"
        done
    fi
    
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    echo "║ METRICS FILES                                                         ║"
    echo "║   Sessions: ${METRICS_FILE}              ║"
    echo "║   Daily:    ${METRICS_DIR}/daily-*.json                      ║"
    echo "║   Weekly:   ${METRICS_DIR}/weekly-*.json                     ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo ""
    
    if [ "$show_details" = "true" ]; then
        echo "=== Detailed Metrics ==="
        if [ -f "${METRICS_FILE}" ]; then
            echo ""
            echo "Token Usage:"
            awk -F'"input_tokens":|"output_tokens":|"total_tokens":' '
            NR>1 {input+=$2; output+=$3; total+=$4}
            END {printf "  Input: %d  Output: %d  Total: %d\n", input, output, total}
            ' "${METRICS_FILE}" 2>/dev/null || true
            
            echo ""
            echo "Mode Distribution:"
            cut -d'"' -f10 "${METRICS_FILE}" 2>/dev/null | sort | uniq -c | sort -rn | head -10 | \
                awk '{printf "  %s: %d sessions\n", $2, $1}' || true
        fi
    fi
}

#-------------------------------------------------------------------------------
# Trend Analysis
#-------------------------------------------------------------------------------

show_trends() {
    local days="${1:-7}"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "                         TREND ANALYSIS ($days days)"
    echo "═══════════════════════════════════════════════════════════════════════"
    
    # Find recent daily files
    local recent_files=$(find "${METRICS_DIR}" -name "daily-*.json" -mtime -"$days" 2>/dev/null | sort)
    
    if [ -z "$recent_files" ]; then
        echo "No recent data available for trend analysis."
        return
    fi
    
    echo ""
    echo "Plan Score Trend:"
    for file in $recent_files; do
        local date=$(basename "$file" | sed 's/daily-\(.*\)\.json/\1/')
        local score=$(jq -r '.avg_plan_score' "$file" 2>/dev/null || echo "N/A")
        printf "  %s: %s\n" "$date" "$score"
    done
    
    echo ""
    echo "Session Volume Trend:"
    for file in $recent_files; do
        local date=$(basename "$file" | sed 's/daily-\(.*\)\.json/\1/')
        local sessions=$(jq -r '.sessions' "$file" 2>/dev/null || echo "N/A")
        local bar=$(printf "%*s" "$sessions" "" | tr ' ' '█')
        printf "  %s: %s (%d)\n" "$date" "$bar" "$sessions"
    done
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
}

#-------------------------------------------------------------------------------
# Alerting
#-------------------------------------------------------------------------------

check_alerts() {
    local alert_level="OK"
    local alerts=()
    
    # Check plan score threshold
    if [ -f "${METRICS_FILE}" ]; then
        local avg_score=$(awk -F'"plan_score": ' '{sum+=$2; count++} END {if(count>0) printf "%.2f", sum/count; else print "0"}' "${METRICS_FILE}" 2>/dev/null || echo "0")
        if (( $(echo "$avg_score < 7.0" | bc -l 2>/dev/null || echo "0") )); then
            alert_level="WARNING"
            alerts+=("Plan score below threshold: $avg_score")
        fi
    fi
    
    # Check for recent errors
    if [ -f "${METRICS_FILE}" ]; then
        local recent_errors=$(tail -10 "${METRICS_FILE}" 2>/dev/null | jq -r '.error_count' 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")
        if [ "$recent_errors" -gt 5 ]; then
            alert_level="CRITICAL"
            alerts+=("High error count in recent sessions: $recent_errors")
        elif [ "$recent_errors" -gt 2 ]; then
            alert_level="WARNING"
            alerts+=("Elevated errors in recent sessions: $recent_errors")
        fi
    fi
    
    # Output alerts
    if [ "$alert_level" != "OK" ]; then
        echo ""
        echo "⚠️  ALERT: $alert_level"
        for alert in "${alerts[@]}"; do
            echo "   - $alert"
        done
        echo ""
    fi
}

#-------------------------------------------------------------------------------
# Main CLI Interface
#-------------------------------------------------------------------------------

usage() {
    cat <<EOF
Forgewright Metrics Collector v1.0.0

USAGE:
    $0 <command> [options]

COMMANDS:
    record <mode> [options]
        Record a new session with metrics
        Options:
            --plan-score <score>    Plan quality score (0-10)
            --input-tokens <n>     Input token count
            --output-tokens <n>    Output token count
            --errors <n>           Error count
            --retries <n>          Retry count
            --duration <ms>        Session duration in milliseconds

    dashboard [--details]
        Display metrics dashboard
        Options:
            --details    Show detailed breakdown

    trends [days]
        Show trend analysis
        Options:
            days         Number of days to analyze (default: 7)

    daily [date]
        Aggregate daily metrics
        Options:
            date         Date in YYYY-MM-DD format (default: today)

    weekly [week]
        Aggregate weekly metrics
        Options:
            week         Week in YYYY-Www format (default: current week)

    alerts
        Check for alert conditions

    collect <type>
        Collect specific metric type
        Options:
            tokens       Token metrics
            latency      Latency metrics
            quality      Quality metrics
            reliability  Reliability metrics
            asip         ASIP metrics
            forgewright  Forgewright stats

    help
        Show this help message

EXAMPLES:
    # Record a session
    $0 record "feature" --plan-score 9.5 --input-tokens 500 --output-tokens 1000

    # Show dashboard
    $0 dashboard --details

    # Show 14-day trends
    $0 trends 14

    # Aggregate today's metrics
    $0 daily

    # Check alerts
    $0 alerts

ENVIRONMENT:
    METRICS_DIR     Override metrics directory (default: .forgewright/metrics)
    METRICS_FILE    Override sessions file (default: sessions.jsonl)

EOF
}

#-------------------------------------------------------------------------------
# Main Entry Point
#-------------------------------------------------------------------------------

main() {
    local command="${1:-help}"
    shift 2>/dev/null || true
    
    case "$command" in
        record)
            local mode="${1:-unknown}"
            local plan_score=0 input_tokens=0 output_tokens=0 error_count=0 retry_count=0 duration=0
            
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --plan-score) plan_score="$2"; shift 2 ;;
                    --input-tokens) input_tokens="$2"; shift 2 ;;
                    --output-tokens) output_tokens="$2"; shift 2 ;;
                    --errors) error_count="$2"; shift 2 ;;
                    --retries) retry_count="$2"; shift 2 ;;
                    --duration) duration="$2"; shift 2 ;;
                    *) shift ;;
                esac
            done
            
            record_session "$mode" "$plan_score" "$input_tokens" "$output_tokens" "$error_count" "$retry_count" "$duration"
            ;;
        dashboard)
            local show_details="false"
            [[ "${1:-}" == "--details" ]] && show_details="true"
            show_dashboard "$show_details"
            ;;
        trends)
            local days="${1:-7}"
            show_trends "$days"
            ;;
        daily)
            local date="${1:-$(date +%Y-%m-%d)}"
            aggregate_daily "$date"
            ;;
        weekly)
            local week="${1:-$(date +%G-W%V)}"
            aggregate_weekly "$week"
            ;;
        alerts)
            check_alerts
            ;;
        collect)
            local type="${1:-}"
            case "$type" in
                tokens) collect_token_metrics ;;
                latency) collect_latency_metrics ;;
                quality) collect_quality_metrics ;;
                reliability) collect_reliability_metrics ;;
                asip) collect_asip_metrics ;;
                forgewright) collect_skill_metrics ;;
                *) log_error "Unknown metric type: $type" ;;
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

# Run main function
main "$@"
