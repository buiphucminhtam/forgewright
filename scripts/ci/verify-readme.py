#!/usr/bin/env python3
"""Check the EN/VI repository front doors against current local source facts.

This checks links, navigation, canonical capability inventory and onboarding
commands. It does not certify product performance or aesthetic quality.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]


def slug(heading: str) -> str:
    text = re.sub(r"<[^>]*>|[*`]", "", heading).strip().lower()
    return re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).replace(" ", "-")


def check_documents(root: Path) -> dict[str, int]:
    inventory = json.loads((root / "docs/capability-maturity.json").read_text())
    manifest = json.loads((root / "product-manifest.json").read_text())
    result = {}
    for name in ("README.md", "README.vi.md"):
        text = (root / name).read_text(encoding="utf-8")
        assert len(text.encode()) < 24000, (
            f"{name}: front door grew beyond its documented scope"
        )
        assert "<!-- padding -->" not in text, f"{name}: padding is not documentation"
        assert "version-" + manifest["product"]["version"] + "-blue" in text
        assert (
            "skills-" + str(manifest["skills"]["canonicalCount"]) + "-brightgreen"
            in text
        )
        headings = re.findall(r"^#{1,6} (.+)$", text, re.MULTILINE)
        anchors = {slug(h) for h in headings}
        links = re.findall(r"\]\(([^)]+)\)", text)
        links += re.findall(r'(?:href|src)="([^"]+)"', text)
        checked = 0
        for link in links:
            if re.match(r"^(?:https?://|mailto:)", link):
                continue
            target, _, anchor = unquote(link).partition("#")
            assert not target.startswith("/"), f"{name}: absolute local link {link}"
            path = (root / target).resolve() if target else root / name
            assert path.is_relative_to(root.resolve()), f"{name}: escaped link {link}"
            assert path.exists(), f"{name}: missing link {link}"
            if anchor and not target:
                assert anchor in anchors, f"{name}: missing section {link}"
            checked += 1
        assert checked >= 20, f"{name}: missing project navigation"
        assert text.count("```mermaid") == 1
        for marker in (
            "ci:bootstrap",
            "build:cli",
            "init /path/to/your-project",
            "onboard /path/to/your-project",
            "test:all",
            "default-off",
            "experimental",
        ):
            # The Vietnamese front page deliberately translates default-off.
            expected = (
                "tắt mặc định"
                if name.endswith(".vi.md") and marker == "default-off"
                else marker
            )
            assert expected in text, f"{name}: missing {expected}"
        if name == "README.md":
            core = text.split("## Core Capabilities\n", 1)[1].split("\n## ", 1)[0]
            capabilities = set(re.findall(r"^### \d+\. (.+)$", core, re.MULTILINE))
            assert capabilities == {
                entry["readme_heading"] for entry in inventory["capabilities"]
            }
        result[name] = checked
    return result


def command(argv: list[str]) -> dict:
    run = subprocess.run(
        argv, cwd=ROOT, text=True, capture_output=True, timeout=30, check=False
    )
    assert run.returncode == 0, f"{argv}: {run.stdout[-2000:]} {run.stderr[-2000:]}"
    return json.loads(run.stdout)


def check_quickstart() -> None:
    cli = str(ROOT / "src/cli/dist/index.js")
    assert Path(cli).is_file(), "Build the CLI first with npm run build:cli"
    # Existing commands are exercised in a disposable project, without model use.
    with tempfile.TemporaryDirectory(prefix="forgewright-readme-") as folder:
        project = Path(folder)
        original = '{"name":"readme-fixture","private":true}\n'
        (project / "package.json").write_text(original)
        initialized = command(["node", cli, "--json", "init", folder])
        onboarded = command(["node", cli, "--json", "onboard", folder])
        assert initialized.get("ok") is True and onboarded.get("ok") is True
        assert (project / "package.json").read_text() == original
        # A second read-style onboarding must not silently overwrite user input.
        assert command(["node", cli, "--json", "onboard", folder]).get("ok") is True


if __name__ == "__main__":
    try:
        links = check_documents(ROOT)
        check_quickstart()
        print(
            json.dumps(
                {
                    "status": "pass",
                    "links_checked": links,
                    "quickstart": "actual init/onboard commands passed in disposable project",
                    "model_calls": 0,
                },
                ensure_ascii=False,
            )
        )
    except (AssertionError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"README verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
