#!/usr/bin/env bash
# forgewright-shell-filter — Token-efficient shell output filter
# Compresses shell command output before LLM context injection.
# Usage: command | bash forgewright-shell-filter.sh [command] [args...]

set -uo pipefail

strip_ansi() {
    sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | sed 's/\x1b(B//g' | sed 's/\r$//'
}

# ─── Git Filters ──────────────────────────────────────────

git_status_filter() {
    awk '
    BEGIN { staged=0; modified=0; untracked=0; conflicts=0; branch="HEAD" }
    /^## / {
        sub(/^## /, "")
        if ($0 ~ /\.\.\./) {
            n=split($0, b, "\\.\\.\\.")
            branch = b[1] "..." b[2]
        } else {
            for (i=1; i<=NF; i++) {
                if ($i !~ /^\[/ && $i !~ /^[+-][0-9]+$/ && $i !~ /^[a-z]+\/[a-z]+$/) {
                    branch=$i; break
                }
            }
        }
        next
    }
    /^[[:space:]]*\(use / { next }
    /^[[:space:]]*$/ { next }
    /^[MADRC!][MADRC?][ ]/ { staged++; next }
    /^[ ][MADRC?!][ ]/ { modified++; next }
    /^\?\? / { untracked++; next }
    /^[A-Z][A-Z][ ]/ { conflicts++; next }
    END {
        printf "%s", branch
        if (staged>0) printf " | +%d staged", staged
        if (modified>0) printf " | ~%d modified", modified
        if (untracked>0) printf " | ?%d untracked", untracked
        if (conflicts>0) printf " | !!%d conflicts", conflicts
        if (staged==0 && modified==0 && untracked==0 && conflicts==0) printf " clean"
        print ""
    }
    '
}

git_log_filter() {
    awk 'BEGIN { c=0; m=20 }
    /^[0-9a-f]+ / { c++; if (c<=m) print; next }
    /^[A-Fa-f0-9]+ / { c++; if (c<=m) print; next }
    END { if (c>m) printf "  ... and %d more\n", c-m }'
}

git_diff_filter() {
    awk '
    BEGIN { ins=0; del=0; files=0 }

    # Per-file line: " path | N +" or " path | N +/-"
    /\|/ {
        n=""; p=""; ap=0; sd=0
        for (i=1; i<=length($0); i++) {
            c=substr($0,i,1)
            if (c=="|") { ap=1; sd=0; n=""; p="" }
            else if (ap && c ~ /[0-9]/) { n=n c; sd=1 }
            else if (ap && c=="+") { ins+=(n==""?1:n+0); n=""; p=""; sd=0 }
            else if (ap && c=="-") { del+=(n==""?1:n+0); n=""; p=""; sd=0 }
            else if (ap && sd && c ~ /[a-z]/) { ap=0; sd=0 }
        }
        files++
        next
    }

    # Summary line: "N files changed, X insertions(+), Y deletions(-)"
    # Replace entire line with the extracted numbers on stdout
    / files? changed/ {
        # Remove everything except numbers: produce "files=N ins=X del=Y"
        line = $0
        gsub(/[^0-9]/, " ", line)
        n = split(line, parts)
        f = 0; i = 0; d = 0
        for (k = 1; k <= n; k++) {
            v = parts[k] + 0
            if (v > 0) {
                if (f == 0) f = v
                else if (i == 0) i = v
                else if (d == 0) d = v
            }
        }
        if (f > 0) files = f
        if (i > 0) ins = i
        if (d > 0) del = d
    }

    END {
        if (files>0 || ins>0 || del>0) {
            if (files==0) files=1
            if (ins==0 && del==0) { print "No changes" }
            else { printf "Changed: %d files | +%d | -%d\n", files, ins, del }
        } else { print "No changes" }
    }
    '
}

git_branch_filter() {
    awk '/^(\* )/ { cur=$0 } /^  / { print } END { if (cur) print cur }'
}

git_stash_filter() {
    awk '/^stash@\{[0-9]+\}/ { gsub(/[{}\t]/, ""); print }'
}

# ─── npm/npx Filters ─────────────────────────────────────

npm_test_filter() {
    awk '
    /Tests:[ \t]+[0-9]+ passed/ {
        n=match($0,/[0-9]+ passed/)
        if (n>0) { num=substr($0,RSTART,RLENGTH); gsub(/[^0-9]/,"",num); print "Tests: " num " passed" }
        next
    }
    /Test Suites:[ \t]+[0-9]+ passed/ {
        n=match($0,/[0-9]+ passed/)
        if (n>0) { num=substr($0,RSTART,RLENGTH); gsub(/[^0-9]/,"",num); print "Suites: " num " passed" }
        next
    }
    /passed/ && !/Suite/ && /[0-9]+ (tests?|pass|ok)/ { print; next }
    /^FAIL / { print }
    /^Test (Suites|Results):/ { print }
    /Time:/ { print }
    '
}

npm_install_filter() {
    awk '
    /^(added|up to date|removed|changed) [0-9]+ package/ { print; next }
    /^up to date/ { print }
    END { if (NR==0) print "No packages changed" }
    ' | head -3
}

npm_build_filter() {
    awk '/^(Build|Compiled|error|warning) / { print } /^(✓|✗|⚠)/ { print } /Done in/ { print } /^error / { print }'
}

npm_lint_filter() {
    awk '/^[0-9]+ (error|warning)/ { print } /^error / { print } /^warning / { print } /errors? (found|processed)/ { print } /^Done in/ { print }'
}

npm_audit_filter() {
    awk '/found [0-9]+ (vulnerability|issue|high|critical)/ { print } /No known vulnerabilities/ { print }'
}

# ─── Cargo Filters ────────────────────────────────────────

cargo_test_filter() {
    awk '/^test result:/ { print; next } /^running [0-9]+ test/ { print; next } /^running [0-9]+ tests/ { print; next } /FAILED/ { print } /^error\[E[0-9]+\]/ { print } /errors? (count:|found)/ { print } /^--- / { print }'
}

cargo_build_filter() {
    awk '/^(Compiling|Finished|Building|Checking) / { print } /error\[E[0-9]+\]/ { print } /^warning:/ { print } /Finished in/ { print } /^   [0-9]+ (error|warning)/ { print }'
}

cargo_clippy_filter() {
    awk '/^error:/ { print } /^warning:/ { print } /^    (Checking|Finished)/ { print } /errors? (during|found)/ { print }'
}

# ─── pytest Filters ───────────────────────────────────────

pytest_filter() {
    awk '
    /^(=====|PASSED|FAILED|ERROR) / { print; next }
    /[0-9]+ passed/ { if (!/::/) { print; next } }
    /[0-9]+ failed/ { if (!/::/) { print; next } }
    /^FAILED / { print }
    /^ERROR / { print }
    /\.py::[a-zA-Z0-9_]+ FAILED/ { print }
    '
}

# ─── Python Filters ────────────────────────────────────────

mypy_filter() {
    awk '/^Found [0-9]+ (error|warning)/ { print } /^error: / { print } /^Success:/ { print }'
}

ruff_filter() {
    awk '/^[0-9]+ (error|warning)/ { print } /^Found [0-9]+ (error|warning)/ { print } /^[a-zA-Z_.-]+:[0-9]+:[0-9]+: / { print } /^Fixed [0-9]+/ { print } /^Remaining [0-9]+/ { print }'
}

black_filter() {
    awk '/^reformatted / { print } /^would reformat / { print } /^All done!/ { print } /^1 file would be/ { print } /^1 file reformatted/ { print }'
}

# ─── Linter Filters ───────────────────────────────────────

linter_filter() {
    awk '/^[0-9]+ (error|warning)/ { print } /^error / { print } /^warning / { print } /errors? (found|processed|encountered)/ { print } /^[a-zA-Z_.-]+\.(py|ts|js|tsx|jsx):[0-9]+:[0-9]+:/ { print } /^(✓|✗|⚠)/ { print } /^Done in/ { print }'
}

# ─── tsc Filters ─────────────────────────────────────────

tsc_filter() {
    awk '/^[0-9]+ (error|warning)/ { print } /^Found [0-9]+ (error|warning)/ { print } /^error TS[0-9]+:/ { print } /^✗ / { print } /^Compilation complete/ { print } /^Watching for/ { print }' | head -10
}

# ─── ls / tree Filters ────────────────────────────────────

ls_filter() {
    awk '
    BEGIN { dirs=0; files=0; symlinks=0 }
    /^total / { next }
    /^d/ { dirs++; if (dirs<=5) { n=split($0,p,"/"); print "dir: " p[n] } next }
    /^l/ { symlinks++; next }
    /^[^-]/ { next }
    { files++; if (files<=20) { n=NF; for(i=n;i>0;i--) { if ($i!="" && $i!~ /^[->]/) { print "file: " $i; break } } } }
    END {
        if (dirs>5) print "... " dirs-5 " more directories"
        if (files>20) print "... " files-20 " more files"
        printf "Total: %d files, %d dirs, %d symlinks\n", files, dirs, symlinks
    }'
}

# ─── grep / ripgrep Filters ───────────────────────────────

grep_filter() {
    awk -F: '
    BEGIN { files=0; cur="" }
    /^$/ { next }
    /:/ {
        f=$1; l=$2
        if (f!=cur) { files++; cur=f; print ">> " f }
        c=""; for(i=3;i<=NF;i++) c=c (i>3?":":"") $i
        if (length(c)>120) c=substr(c,1,120) "..."
        printf "   %s: %s\n", l, c
        next
    }
    { print }
    '
}

# ─── docker / kubectl Filters ──────────────────────────────

docker_kubectl_filter() {
    awk -v cmd="$1" '
    BEGIN { running=0; pending=0; errors=0 }
    /^CONTAINER ID/ { next }
    cmd ~ /^docker$/ && /^[a-z0-9]+[a-z0-9]{12}/ { if ($NF ~ /^(Up|Exited|Created|Restarting)/) print $NF; next }
    /^ Name/ { next }
    /^---/ { next }
    cmd ~ /compose/ && /^[a-z]/ { print; next }
    /^NAME|^NAMESPACE/ { print; next }
    cmd ~ /kubectl/ {
        if (/Running/) running++
        else if (/Pending|ContainerCreating|Init:/) pending++
        else if (/Error|BackOff|Failed|Evicted|CrashLoop/) errors++
    }
    /^Name:|^Namespace:|^Type:|^Status:/ { print }
    /^Events:/ { exit }
    /^[a-z]+[.][a-z]+.*[0-9]+\/[0-9]+/ { print }
    END {
        if (cmd ~ /kubectl/) {
            if (running>0) print "Running: " running
            if (pending>0) print "Pending: " pending
            if (errors>0) print "Errors: " errors
        }
    }'
}

# ─── HTTP / curl Filters ──────────────────────────────────

http_filter() {
    awk '
    BEGIN { status=""; ctype=""; body=0 }
    /^HTTP\// { status=$2; print; next }
    /^Content-Type:/ { ctype=$2; next }
    /^Content-Length:/ { next }
    /^$/ {
        if (status!="") { print "Status: " status; if (ctype!="") print "Type: " ctype }
        next
    }
    status ~ /^[23][0-9][0-9]/ && /^[[:space:]]*[\[{]/ {
        if (body<10) { print; body++ }
        else if (body==10) { print "... (truncated)"; body++ }
        next
    }
    status ~ /^[45][0-9][0-9]/ && NF>0 { print }
    '
}

# ─── Fallback Filter ──────────────────────────────────────

fallback_filter() {
    awk 'BEGIN { l=0; m=80 }
    { l++; if (l<=m) { if (length($0)>200) print substr($0,1,200) "..."; else print } }
    END { if (l>m) printf "\n... [%d more lines, truncated]\n", l-m }'
}

# ─── Main Routing ──────────────────────────────────────────

route_and_filter() {
    local cmd="$1"
    shift
    local sub="$*"

    case "$cmd" in
        git)
            case "$sub" in
                status*|--short*|-s*)          git_status_filter ;;
                log*|--oneline*)                 git_log_filter ;;
                diff*|--stat*)                   git_diff_filter ;;
                branch*|-vv*)                     git_branch_filter ;;
                stash*)                          git_stash_filter ;;
                *)                               fallback_filter ;;
            esac ;;
        npm|npx)
            case "$sub" in
                *test*|--test*|*run\ test*|jest|vitest)  npm_test_filter ;;
                *install*|*i*|*add*)                     npm_install_filter ;;
                *build*|--build*|*run\ build*)           npm_build_filter ;;
                *lint*|*eslint*|*tsc*)                    npm_lint_filter ;;
                *audit*)                                npm_audit_filter ;;
                *)                                      fallback_filter ;;
            esac ;;
        cargo)
            case "$sub" in
                *test*|*test-*|*--test*)          cargo_test_filter ;;
                *build*|*check*)                  cargo_build_filter ;;
                *clippy*)                         cargo_clippy_filter ;;
                *)                               fallback_filter ;;
            esac ;;
        pytest)                        pytest_filter ;;
        python|python3)
            case "$sub" in
                *pytest*|*test*)               pytest_filter ;;
                *mypy*)                         mypy_filter ;;
                *ruff*)                         ruff_filter ;;
                *black*)                        black_filter ;;
                *)                              fallback_filter ;;
            esac ;;
        ls|dir|tree)                   ls_filter ;;
        grep|rg|ag|fzf)                grep_filter ;;
        tsc|npx\ tsc|pnpm\ dlx\ tsc)  tsc_filter ;;
        eslint|npx\ eslint|pnpm\ lint|lint)
            linter_filter ;;
        kubectl|docker|docker\ compose)
            docker_kubectl_filter "$cmd" ;;
        curl|wget|http)                 http_filter ;;
        *)                              fallback_filter ;;
    esac
}

# ─── CLI Entry Point ──────────────────────────────────────

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main_filter() {
        local cmd="${1:-}"
        shift || true
        local output
        output=$(cat)
        local size=${#output}
        if [[ -z "$output" ]]; then exit 0; fi
        # Always filter git commands; skip small output for others
        if [[ $size -lt 200 ]] && [[ "$cmd" != "git" ]]; then
            echo "$output"; exit 0
        fi
        output=$(echo "$output" | strip_ansi)
        local filtered
        filtered=$(echo "$output" | route_and_filter "$cmd" "$@")
        if [[ -n "$filtered" ]]; then echo "$filtered"
        else echo "$output"; fi
    }
    main_filter "$@"
else
    run_filter() {
        local cmd="$1"; shift
        local out=$(cat)
        if [[ -z "$out" ]] || [[ ${#out} -lt 200 ]]; then echo "$out"; return 0; fi
        out=$(echo "$out" | strip_ansi)
        local f=$(echo "$out" | route_and_filter "$cmd" "$@")
        if [[ -n "$f" ]]; then echo "$f"; else echo "$out"; fi
    }
fi
