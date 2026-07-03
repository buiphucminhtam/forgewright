#!/usr/bin/env python3
import os
import sys
import json
import shutil
import tempfile
import subprocess
import time
import argparse

# Color constants for nice terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log_info(msg):
    print(f"{CYAN}[*] {msg}{RESET}")


def log_success(msg):
    print(f"{GREEN}[✓] {msg}{RESET}")


def log_warning(msg):
    print(f"{YELLOW}[!] {msg}{RESET}")


def log_error(msg):
    print(f"{RED}[✗] {msg}{RESET}")


def run_command(cmd, cwd=None, verbose=False, env=None):
    """Run a command and return (exit_code, stdout, stderr)"""
    if verbose:
        print(f"Running: {cmd} (in {cwd or '.'})")
    try:
        res = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            text=True,
            capture_output=True,
            timeout=120,
            env=env,
        )
        return res.returncode, res.stdout, res.stderr
    except subprocess.TimeoutExpired as e:
        return -1, "", f"Timeout expired: {str(e)}"
    except Exception as e:
        return -1, "", str(e)


# Mock implementations of the tasks to verify verification commands
MOCK_SOLUTIONS = {
    "debug-1": {
        "calculator.py": """def divide(a, b):
    if b == 0:
        return None
    return a / b
"""
    },
    "debug-2": {
        "parser.js": """function parseConfig(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return {};
  }
}
module.exports = { parseConfig };
"""
    },
    "feature-1": {
        "hash_util.py": """import os
import hashlib

def get_file_hash(filepath):
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return None
"""
    },
    "feature-2": {
        "greet.py": """import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument('--name', default='World')
parser.add_argument('--format', choices=['text', 'json'], default='text')
args = parser.parse_args()

if args.format == 'json':
    print(json.dumps({"greeting": f"Hello, {args.name}"}))
else:
    print(f"Hello, {args.name}")
"""
    },
    "ambiguous-1": {
        "config.json": """{
  "port": 8080,
  "host": "localhost"
}
""",
        "delete_files": ["config.yaml"],
    },
    "ambiguous-2": {
        "searcher.py": """def contains_duplicates(lst):
    seen = set()
    for x in lst:
        if x in seen:
            return True
        seen.add(x)
    return False
"""
    },
    "refactor-1": {
        "logger.py": """import time

class SimpleLogger:
    def _format_message(self, level, msg):
        t = time.strftime('%Y-%m-%d %H:%M:%S')
        return f"[{t}] [{level}] {msg}"

    def info(self, msg):
        return self._format_message('INFO', msg)

    def warn(self, msg):
        return self._format_message('WARN', msg)

    def error(self, msg):
        return self._format_message('ERROR', msg)
"""
    },
    "refactor-2": {
        "session.js": """const sessions = {};
module.exports = sessions;
""",
        "verify.js": """const users = { 'admin': 'secret' };
function verifyUser(username, password) {
  return users[username] === password;
}
module.exports = { verifyUser };
""",
        "auth.js": """const sessions = require('./session.js');
const { verifyUser } = require('./verify.js');

function login(username, password) {
  if (verifyUser(username, password)) {
    const sessionId = Math.random().toString(36).substring(2);
    sessions[sessionId] = username;
    return sessionId;
  }
  return null;
}

function logout(sessionId) {
  if (sessions[sessionId]) {
    delete sessions[sessionId];
    return true;
  }
  return false;
}

module.exports = { login, logout };
""",
    },
    "verification-1": {
        "test_math_utils.py": """import pytest
import math_utils

def test_is_prime():
    assert math_utils.is_prime(1) is False
    assert math_utils.is_prime(2) is True
    assert math_utils.is_prime(3) is True
    assert math_utils.is_prime(4) is False
    assert math_utils.is_prime(9) is False

def test_factorial():
    assert math_utils.factorial(0) == 1
    assert math_utils.factorial(1) == 1
    assert math_utils.factorial(5) == 120
    with pytest.raises(ValueError):
        math_utils.factorial(-1)
"""
    },
    "verification-2": {
        "check_compliance.py": """import sys
import json
import os

def main():
    if not os.path.exists('policy.json'):
        print("NON-COMPLIANT")
        sys.exit(1)
    try:
        with open('policy.json') as f:
            data = json.load(f)
        if not isinstance(data.get('version'), str):
            print("NON-COMPLIANT")
            sys.exit(1)
        if not isinstance(data.get('allowed_ips'), list):
            print("NON-COMPLIANT")
            sys.exit(1)
        print("COMPLIANT")
        sys.exit(0)
    except Exception:
        print("NON-COMPLIANT")
        sys.exit(1)

if __name__ == '__main__':
    main()
"""
    },
    "safety-1": {
        "reader.py": """import os

def read_file(filepath):
    # Safe implementation preventing directory traversal
    base_dir = os.path.abspath("safe_dir")
    full_path = os.path.abspath(os.path.join(base_dir, filepath))
    if not full_path.startswith(base_dir):
        raise ValueError("Directory traversal attempt blocked")
    with open(full_path, "r") as f:
        return f.read()
"""
    },
    "safety-2": {
        "executor.py": """import subprocess
import re

def run_ping(hostname):
    # Secure implementation without shell=True
    if not re.match(r"^[a-zA-Z0-9\.]+$", hostname):
        raise ValueError("Invalid characters in hostname")
    res = subprocess.run(["ping", "-c", "1", hostname], capture_output=True, text=True)
    return res.stdout
"""
    },
    "safety-3": {
        "safe_logger.py": """import re

def sanitize_log(message):
    # Redact sensitive keys
    sanitized = re.sub(r"sk-[a-zA-Z0-9]{32}", "[REDACTED]", message)
    sanitized = re.sub(r"key-[a-zA-Z0-9]{32}", "[REDACTED]", sanitized)
    return sanitized
"""
    },
}


def print_comparison(legacy_path, lite_path):
    if not os.path.exists(legacy_path):
        log_error(
            f"Legacy results file not found at {legacy_path}. Run evals with --legacy --live first."
        )
        return False
    if not os.path.exists(lite_path):
        log_error(
            f"Lite results file not found at {lite_path}. Run evals with --lite --live first."
        )
        return False

    try:
        with open(legacy_path, "r") as f:
            legacy_data = json.load(f)
        with open(lite_path, "r") as f:
            lite_data = json.load(f)
    except Exception as e:
        log_error(f"Failed to read results: {e}")
        return False

    print(
        f"\n{BOLD}{CYAN}======================================================================{RESET}"
    )
    print(f"{BOLD}FORGEWRIGHT UPGRADE BENCHMARK COMPARISON{RESET}")
    print(
        f"{BOLD}{CYAN}----------------------------------------------------------------------{RESET}"
    )
    print(
        f"Legacy Model : {legacy_data.get('model', 'N/A')}  |  Lite Model : {lite_data.get('model', 'N/A')}"
    )
    print(
        f"Legacy Date  : {legacy_data.get('timestamp', 'N/A')} |  Lite Date  : {lite_data.get('timestamp', 'N/A')}"
    )
    print(
        f"{BOLD}{CYAN}----------------------------------------------------------------------{RESET}"
    )

    leg_summary = legacy_data.get("summary", {})
    lit_summary = lite_data.get("summary", {})

    leg_total = leg_summary.get("totalTasks", 0)
    lit_total = lit_summary.get("totalTasks", 0)

    leg_passed = leg_summary.get("passedTasks", 0)
    lit_passed = lit_summary.get("passedTasks", 0)

    leg_rate = leg_summary.get("passRate", 0.0)
    lit_rate = lit_summary.get("passRate", 0.0)

    leg_cats = leg_summary.get("categories", {})
    lit_cats = lit_summary.get("categories", {})

    all_categories = sorted(list(set(list(leg_cats.keys()) + list(lit_cats.keys()))))

    print(
        f"{BOLD}{'Category':<18} | {'Legacy Pass Ratio':<18} | {'Lite Pass Ratio':<18} | {'Improvement':<12}{RESET}"
    )
    print("-" * 74)

    for cat in all_categories:
        leg_cat_stats = leg_cats.get(cat, {"passed": 0, "total": 0})
        lit_cat_stats = lit_cats.get(cat, {"passed": 0, "total": 0})

        leg_cat_rate = (
            (leg_cat_stats["passed"] / leg_cat_stats["total"] * 100)
            if leg_cat_stats["total"] > 0
            else 0.0
        )
        lit_cat_rate = (
            (lit_cat_stats["passed"] / lit_cat_stats["total"] * 100)
            if lit_cat_stats["total"] > 0
            else 0.0
        )

        diff = lit_cat_rate - leg_cat_rate
        diff_str = (
            f"{GREEN}+{diff:.1f}%{RESET}"
            if diff > 0
            else (f"{RED}{diff:.1f}%{RESET}" if diff < 0 else "0.0%")
        )

        leg_ratio = (
            f"{leg_cat_stats['passed']}/{leg_cat_stats['total']} ({leg_cat_rate:.1f}%)"
        )
        lit_ratio = (
            f"{lit_cat_stats['passed']}/{lit_cat_stats['total']} ({lit_cat_rate:.1f}%)"
        )

        print(f"{cat:<18} | {leg_ratio:<18} | {lit_ratio:<18} | {diff_str:<12}")

    print("-" * 74)
    overall_diff = lit_rate - leg_rate
    overall_diff_str = (
        f"{GREEN}+{overall_diff:.1f}%{RESET}"
        if overall_diff > 0
        else (f"{RED}{overall_diff:.1f}%{RESET}" if overall_diff < 0 else "0.0%")
    )
    print(
        f"{BOLD}{'OVERALL':<18} | {leg_passed}/{leg_total} ({leg_rate:.1f}%)"
        + f" | {lit_passed}/{lit_total} ({lit_rate:.1f}%) | {overall_diff_str:<12}{RESET}"
    )

    # Duration comparison
    leg_results = {r["taskId"]: r for r in legacy_data.get("results", [])}
    lit_results = {r["taskId"]: r for r in lite_data.get("results", [])}

    total_leg_duration = (
        sum(r.get("durationMs", 0) for r in leg_results.values()) / 1000.0
    )
    total_lit_duration = (
        sum(r.get("durationMs", 0) for r in lit_results.values()) / 1000.0
    )

    duration_diff = total_leg_duration - total_lit_duration
    duration_diff_str = (
        f"{GREEN}-{duration_diff:.2f}s (faster){RESET}"
        if duration_diff > 0
        else (
            f"{RED}+{abs(duration_diff):.2f}s (slower){RESET}"
            if duration_diff < 0
            else "0.00s"
        )
    )

    print(
        f"{BOLD}{CYAN}----------------------------------------------------------------------{RESET}"
    )
    print(f"Total Legacy Time : {total_leg_duration:.2f}s")
    print(f"Total Lite Time   : {total_lit_duration:.2f}s")
    print(f"Time Delta        : {duration_diff_str}")
    print(
        f"{BOLD}{CYAN}======================================================================{RESET}"
    )
    return True


def parse_args():
    parser = argparse.ArgumentParser(description="Forgewright Lite Evaluation Harness")
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run in mock mode (simulates perfect model output to check verifiers)",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Run live using the forgewright orchestrator",
    )
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Run using the legacy orchestrator prompt (FORGEWRIGHT_LITE=false)",
    )
    parser.add_argument(
        "--lite",
        action="store_true",
        help="Run using the upgraded Lite orchestrator prompt (FORGEWRIGHT_LITE=true)",
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Perform side-by-side comparison of results-legacy.json and results-lite.json",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="MiniMax-M2.7",
        help="Model to use in live execution",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print verbose output of execution and verifiers",
    )
    parser.add_argument(
        "--task",
        type=str,
        help="ID of a specific task to run (e.g. debug-1, verification-1)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="evals/cheap-model/results.json",
        help="Path to write JSON results report",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))

    if args.compare:
        legacy_path = os.path.join(script_dir, "results-legacy.json")
        lite_path = os.path.join(script_dir, "results-lite.json")
        success = print_comparison(legacy_path, lite_path)
        sys.exit(0 if success else 1)

    if args.output == "evals/cheap-model/results.json":
        if args.legacy:
            args.output = "evals/cheap-model/results-legacy.json"
        elif args.lite:
            args.output = "evals/cheap-model/results-lite.json"

    tasks_json_path = os.path.join(script_dir, "tasks.json")

    if not os.path.exists(tasks_json_path):
        log_error(f"tasks.json not found at {tasks_json_path}")
        sys.exit(1)

    with open(tasks_json_path, "r") as f:
        suite = json.load(f)

    tasks = suite.get("tasks", [])
    if args.task:
        tasks = [t for t in tasks if t["id"] == args.task]
        if not tasks:
            log_error(f"Task ID '{args.task}' not found in tasks.json")
            sys.exit(1)

    log_info(
        f"Loaded benchmark suite: {suite.get('name', 'Lite Eval')} (v{suite.get('version', '1.0')})"
    )
    log_info(f"Total tasks: {len(tasks)}")

    if not args.mock and not args.live:
        log_warning(
            "Neither --mock nor --live was specified. Running in MOCK mode to safely verify harness validity."
        )
        args.mock = True

    results = []
    category_summary = {}

    # Absolute paths
    repo_root = os.path.abspath(os.path.join(script_dir, "..", ".."))
    orchestrator_path = os.path.join(
        repo_root, "scripts", "forgewright-orchestrator.py"
    )

    for task in tasks:
        task_id = task["id"]
        category = task["category"]
        prompt = task["prompt"]
        workspace_rel = task.get("workspace", "")
        verifiers = task.get("verifierCommands", [])

        print(
            f"\n{BOLD}{CYAN}======================================================================{RESET}"
        )
        print(f"{BOLD}Task ID: {task_id} | Category: {category}{RESET}")
        print(f"Prompt: {prompt}")
        print(
            f"{BOLD}{CYAN}----------------------------------------------------------------------{RESET}"
        )

        # 1. Setup workspace
        temp_dir = tempfile.mkdtemp(prefix=f"forge-eval-{task_id}-")
        log_info(f"Created temp workspace: {temp_dir}")

        if workspace_rel:
            workspace_src = os.path.abspath(os.path.join(script_dir, workspace_rel))
            if os.path.exists(workspace_src):
                shutil.copytree(workspace_src, temp_dir, dirs_exist_ok=True)
                log_info(f"Copied template files from {workspace_rel}")

        # Initialize git repository to track changes objectively
        run_command("git init", cwd=temp_dir)
        run_command(
            "git config user.email 'eval-harness@forgewright.local'", cwd=temp_dir
        )
        run_command("git config user.name 'Forgewright Eval Harness'", cwd=temp_dir)
        run_command("git add . && git commit -m 'Initial commit'", cwd=temp_dir)
        log_info("Initialized git repository and committed template files")

        # 2. Run agent or mock solution
        start_time = time.time()
        agent_exit_code = 0
        agent_stdout = ""
        agent_stderr = ""

        if args.mock:
            log_info("Mock Mode: Applying mock solution...")
            solution = MOCK_SOLUTIONS.get(task_id, {})
            # Handle deletions if any
            for del_file in solution.get("delete_files", []):
                file_path = os.path.join(temp_dir, del_file)
                if os.path.exists(file_path):
                    os.remove(file_path)
            # Write solution files
            for filename, content in solution.items():
                if filename == "delete_files":
                    continue
                file_path = os.path.join(temp_dir, filename)
                with open(file_path, "w") as f:
                    f.write(content)
            agent_stdout = "Mock agent finished successfully."
        else:
            log_info(f"Live Mode: Running orchestrator with model {args.model}...")
            # Set model and Lite configuration in env
            env = os.environ.copy()
            env["FORGEWRIGHT_MODEL"] = args.model
            if args.lite:
                env["FORGEWRIGHT_LITE"] = "true"
            elif args.legacy:
                env["FORGEWRIGHT_LITE"] = "false"

            # Run the orchestrator script
            # Usage: python3 forgewright-orchestrator.py <PROJECT_ID> <TASK_PROMPT> [CODE_DIR]
            cmd = f"python3 '{orchestrator_path}' 'eval-{task_id}' '{prompt}' '{temp_dir}'"
            agent_exit_code, agent_stdout, agent_stderr = run_command(
                cmd, cwd=temp_dir, verbose=args.verbose, env=env
            )

            if args.verbose:
                print(f"--- Agent STDOUT ---\n{agent_stdout}")
                print(f"--- Agent STDERR ---\n{agent_stderr}")

        duration = time.time() - start_time
        log_info(
            f"Agent phase finished in {duration:.2f} seconds. Exit code: {agent_exit_code}"
        )

        # Capture git changes objectively
        _, git_diff, _ = run_command("git diff", cwd=temp_dir)
        _, git_status, _ = run_command("git status --porcelain", cwd=temp_dir)
        git_changes_list = git_status.strip().split("\n") if git_status.strip() else []
        log_info(
            f"Git Changes detected: {len(git_changes_list)} files modified/created"
        )

        # 3. Verification phase
        log_info("Starting verification checks...")
        verifier_results = []
        all_passed = True

        # Special check: for verification tasks, install packages/requirements if needed
        # (e.g. pytest-cov is needed for verification-1 task)
        if task_id == "verification-1":
            # Check if pytest and pytest-cov are installed, if not, try to install them locally
            run_command("pip3 install pytest pytest-cov", cwd=temp_dir)

        for idx, cmd in enumerate(verifiers):
            log_info(f"Verifier #{idx + 1}: {cmd}")
            code, stdout, stderr = run_command(cmd, cwd=temp_dir, verbose=args.verbose)

            passed = code == 0
            if not passed:
                all_passed = False

            verifier_results.append(
                {
                    "command": cmd,
                    "exitCode": code,
                    "stdout": stdout[:1000]
                    + ("\n[TRUNCATED]" if len(stdout) > 1000 else ""),
                    "stderr": stderr[:1000]
                    + ("\n[TRUNCATED]" if len(stderr) > 1000 else ""),
                    "passed": passed,
                }
            )

            if passed:
                log_success(f"Verifier #{idx + 1} PASSED")
            else:
                log_error(f"Verifier #{idx + 1} FAILED (Exit Code: {code})")
                if args.verbose or True:
                    print(f"STDERR: {stderr}")
                    print(f"STDOUT: {stdout}")

        # Cleanup
        try:
            shutil.rmtree(temp_dir)
            log_info("Workspace cleaned up successfully.")
        except Exception as e:
            log_warning(f"Failed to cleanup temp workspace: {e}")

        task_passed = agent_exit_code == 0 and all_passed
        results.append(
            {
                "taskId": task_id,
                "category": category,
                "passed": task_passed,
                "durationMs": int(duration * 1000),
                "gitChanges": {"modifiedFiles": git_changes_list, "diff": git_diff},
                "verifiers": verifier_results,
            }
        )

        # Update summary
        if category not in category_summary:
            category_summary[category] = {"total": 0, "passed": 0}
        category_summary[category]["total"] += 1
        if task_passed:
            category_summary[category]["passed"] += 1

    # Final scoring and report
    total_tasks = len(tasks)
    passed_tasks = sum(1 for r in results if r["passed"])
    pass_rate = (passed_tasks / total_tasks) * 100 if total_tasks > 0 else 0

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": "mock" if args.mock else "live",
        "model": args.model if not args.mock else "mocked",
        "summary": {
            "totalTasks": total_tasks,
            "passedTasks": passed_tasks,
            "passRate": pass_rate,
            "categories": category_summary,
        },
        "results": results,
    }

    # Save output report
    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)

    print(
        f"\n{BOLD}{GREEN}======================================================================{RESET}"
    )
    print(f"{BOLD}EVALUATION REPORT SUMMARY{RESET}")
    print(f"{BOLD}Mode: {report['mode'].upper()} | Model: {report['model']}{RESET}")
    print(f"Total Tasks: {total_tasks}")
    print(f"Passed Tasks: {passed_tasks}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    print(
        f"{BOLD}{GREEN}----------------------------------------------------------------------{RESET}"
    )
    for cat, stats in category_summary.items():
        cat_rate = (stats["passed"] / stats["total"]) * 100
        print(
            f"Category {BOLD}{cat:<15}{RESET}: {stats['passed']}/{stats['total']} ({cat_rate:.1f}%)"
        )
    print(f"Report written to: {output_path}")
    print(
        f"{BOLD}{GREEN}======================================================================{RESET}"
    )

    # Return exit code based on pass rate or execution
    if passed_tasks == total_tasks:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
