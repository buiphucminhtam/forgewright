#!/usr/bin/env python3
# scripts/lite/context-manager.py
# Forgewright Phase 5 — Context Manager
import os
import sys
import subprocess


def load_context():
    output = []

    files = [
        (".forgewright/memory-bank/activeContext.md", 150),
        (".forgewright/memory-bank/HANDOVER.md", 150),
        (".forgewright/subagent-context/CONVERSATION_SUMMARY.md", 100),
    ]

    loaded_sources = 0
    for path, token_limit in files:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                char_limit = token_limit * 4
                if len(content) > char_limit:
                    content = content[:char_limit] + "...[truncated]"
                output.append(f"--- {os.path.basename(path)} ---\n{content}\n")
                loaded_sources += 1

    mem0_path = "scripts/mem0-v2.py"
    if os.path.exists(mem0_path):
        res = subprocess.run(
            f"python3 {mem0_path} search 'context' --limit 3",
            shell=True,
            capture_output=True,
            text=True,
        )
        if res.returncode == 0 and res.stdout.strip():
            output.append(f"--- mem0 ---\n{res.stdout.strip()[:400]}\n")
            loaded_sources += 1

    print("\n".join(output))
    print(f"✓ Memory loaded: {loaded_sources} sources injected")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "load":
        load_context()
    else:
        print("Usage: python3 context-manager.py load")
        sys.exit(1)


if __name__ == "__main__":
    main()
