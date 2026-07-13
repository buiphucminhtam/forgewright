import json
import re
import shlex
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
README = ROOT / "README.md"
INVENTORY = ROOT / "docs" / "capability-maturity.json"
MATURITY = {"stable", "beta", "experimental", "docs-only"}
AUTOMATED_EVIDENCE = re.compile(r"(^tests/|\.test\.[^.]+$|^scripts/ci/)")


def _readme_capabilities() -> set[str]:
    content = README.read_text(encoding="utf-8")
    section = content.split("## Core Capabilities", 1)[1].split("\n## ", 1)[0]
    return set(re.findall(r"^### \d+\. (.+)$", section, flags=re.MULTILINE))


def test_every_readme_capability_has_maturity_and_existing_evidence() -> None:
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    assert inventory["schema_version"] == 1
    capabilities = inventory["capabilities"]
    assert {item["readme_heading"] for item in capabilities} == _readme_capabilities()
    assert len({item["id"] for item in capabilities}) == len(capabilities)
    for item in capabilities:
        assert item["maturity"] in MATURITY
        assert item["placement"] in {"core", "optional-pack"}
        assert item["evidence"], item["id"]
        if item["maturity"] == "beta":
            assert any(AUTOMATED_EVIDENCE.search(path) for path in item["evidence"]), (
                f"beta capability lacks automated evidence: {item['id']}"
            )
            command = item.get("verification_command")
            assert isinstance(command, str) and command.strip(), item["id"]
            bound_paths = [
                path.removeprefix("mcp/") if "--prefix mcp" in command else path
                for path in item["evidence"]
            ]
            assert any(path in command for path in bound_paths), (
                f"beta verification command is not bound to its evidence: {item['id']}"
            )
            result = subprocess.run(
                shlex.split(command),
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            assert result.returncode == 0, (
                f"beta verification failed for {item['id']}:\n{result.stdout}\n{result.stderr}"
            )
        if item["maturity"] == "stable":
            assert item.get("hosted_production_evidence"), item["id"]
            assert item.get("rollback_evidence"), item["id"]
            for evidence in (
                item["hosted_production_evidence"],
                item["rollback_evidence"],
            ):
                assert (ROOT / evidence.split("#", 1)[0]).is_file()
        for evidence in item["evidence"]:
            path = evidence.split("#", 1)[0]
            assert (ROOT / path).is_file(), f"missing evidence for {item['id']}: {path}"


def test_non_core_domains_are_explicit_optional_packs() -> None:
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    packs = inventory["optional_packs"]
    assert {item["id"] for item in packs} == {"game", "xr", "research", "growth"}
    assert all(item["maturity"] == "docs-only" for item in packs)
    assert all(item["placement"] == "optional-pack" for item in packs)
    assert all(item["evidence"] for item in packs)
    for item in packs:
        for evidence in item["evidence"]:
            assert (ROOT / evidence.split("#", 1)[0]).is_file(), (
                f"missing optional-pack evidence for {item['id']}: {evidence}"
            )
