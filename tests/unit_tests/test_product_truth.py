import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = REPO_ROOT / "scripts" / "ci" / "verify-product-truth.py"
MANIFEST = json.loads((REPO_ROOT / "product-manifest.json").read_text())


def _write(root: Path, relative: str, content: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _fixture(tmp_path: Path) -> Path:
    manifest = deepcopy(MANIFEST)
    manifest["skills"].update(
        {"canonicalCount": 2, "aliasCount": 1, "installedCount": 3}
    )
    manifest["modes"]["count"] = 2
    manifest["modes"]["inventory"] = ["Feature", "Debug"]
    manifest["modes"]["excludedHeadings"] = ["Mode Overview"]
    manifest["supportedSurfaces"] = [manifest["supportedSurfaces"][0]]
    _write(tmp_path, "product-manifest.json", json.dumps(manifest))

    pipeline = " → ".join(manifest["pipeline"]["phases"])
    version = manifest["product"]["version"]
    _write(
        tmp_path,
        "package.json",
        json.dumps(
            {
                "name": "forgewright",
                "version": version,
                "description": "2 skills, 2 modes. Pipeline: " + pipeline,
            }
        ),
    )
    _write(
        tmp_path,
        "README.md",
        f"version-{version}-blue\nskills-2-brightgreen\n`{pipeline}`\n",
    )
    _write(
        tmp_path,
        "docs/product-overview.md",
        f"**Version:** {version}\n2 specialized AI skills\n"
        f"one of 2 execution modes\n{pipeline}\n"
        "| **Cursor** | `AGENTS.md` | ✅ Full | Stable | supported |\n",
    )
    _write(
        tmp_path,
        "docs/index.md",
        f"2 AI skills\n2 execution modes\nCurrent version: **{version}**\n",
    )
    _write(
        tmp_path,
        "docs/mode-reference.md",
        "## Mode Overview\n## Feature\n## Debug\n",
    )
    _write(
        tmp_path,
        "skills/skills-registry.yaml",
        "skills:\n"
        "  - name: alpha\n    type: canonical\n"
        "  - name: beta\n    type: canonical\n"
        "  - name: alias\n    type: alias\n",
    )
    for name in ("alpha", "beta", "alias"):
        _write(tmp_path, f"skills/{name}/SKILL.md", f"# {name}\n")
    return tmp_path


def _run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), "--root", str(root)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_valid_product_truth_fixture_passes(tmp_path: Path) -> None:
    result = _run(_fixture(tmp_path))

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Product truth verified" in result.stdout


def test_version_drift_has_clear_error(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    package_path = root / "package.json"
    package = json.loads(package_path.read_text())
    package["version"] = "0.0.0"
    package_path.write_text(json.dumps(package))

    result = _run(root)

    assert result.returncode == 1
    assert (
        f"package.json version is 0.0.0; expected {MANIFEST['product']['version']}"
        in result.stdout
    )


def test_skill_inventory_drift_has_clear_error(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    (root / "skills" / "beta" / "SKILL.md").unlink()

    result = _run(root)

    assert result.returncode == 1
    assert "installed skill count is 2; expected 3" in result.stdout
    assert "registry entries missing SKILL.md: beta" in result.stdout


def test_pipeline_drift_has_clear_error(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    readme = root / "README.md"
    readme.write_text(readme.read_text().replace(" → SUSTAIN", ""))

    result = _run(root)

    assert result.returncode == 1
    assert "README.md is missing canonical pipeline" in result.stdout


def test_mode_inventory_drift_has_clear_error(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    _write(root, "docs/mode-reference.md", "## Mode Overview\n## Feature\n")

    result = _run(root)

    assert result.returncode == 1
    assert "mode inventory differs" in result.stdout
    assert "missing=['Debug']" in result.stdout


def test_product_overview_drift_has_clear_error(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    overview = root / "docs" / "product-overview.md"
    overview.write_text(overview.read_text().replace("one of 2 execution modes", ""))

    result = _run(root)

    assert result.returncode == 1
    assert (
        "docs/product-overview.md is missing declared mode count: "
        "one of 2 execution modes"
    ) in result.stdout


def test_conflicting_skill_count_is_rejected(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    docs_index = root / "docs" / "index.md"
    docs_index.write_text(
        docs_index.read_text(encoding="utf-8") + "validates all 70 skills\n",
        encoding="utf-8",
    )

    result = _run(root)

    assert result.returncode == 1
    assert "docs/index.md contains conflicting skills counts: [70]" in result.stdout


def test_mode_rename_with_same_count_is_rejected(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    _write(
        root, "docs/mode-reference.md", "## Mode Overview\n## Feature\n## Arbitrary\n"
    )

    result = _run(root)

    assert result.returncode == 1
    assert "missing=['Debug']" in result.stdout
    assert "unexpected=['Arbitrary']" in result.stdout


def test_malformed_surface_is_a_validation_error(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    manifest_path = root / "product-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["supportedSurfaces"] = ["cursor"]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = _run(root)

    assert result.returncode == 1
    assert "supportedSurfaces[0] must be an object" in result.stdout
    assert "Traceback" not in result.stderr


def test_surface_maturity_drift_is_rejected(tmp_path: Path) -> None:
    root = _fixture(tmp_path)
    manifest_path = root / "product-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["supportedSurfaces"][0]["maturity"] = "beta"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = _run(root)

    assert result.returncode == 1
    assert "truthMarker must encode maturity Beta" in result.stdout
