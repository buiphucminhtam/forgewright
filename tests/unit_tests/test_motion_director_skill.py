"""RF11 integration tests for motion-director skill: lazy routing, zero non-motion overhead, packaging, and rubric boundaries."""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
from pathlib import Path

import pytest

from scripts.runtime.skill_routing import route_skills

ROOT = Path(__file__).resolve().parents[2]
SKILL_DIR = ROOT / "skills" / "motion-director"
EVALS = json.loads((SKILL_DIR / "evals" / "routing.json").read_text(encoding="utf-8"))


def _names(result: dict) -> list[str]:
    assert result["status"] == "ok", result
    return [skill["name"] for skill in result["skills"]]


def test_motion_director_frontmatter_provenance_and_relative_rubric():
    skill_md = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    lite_md = (SKILL_DIR / "LITE.md").read_text(encoding="utf-8")
    rubric_md = (SKILL_DIR / "references" / "motion-quality-rubric.md").read_text(encoding="utf-8")

    assert "name: motion-director" in skill_md
    assert "license: CC0-1.0" in skill_md
    assert "713a8680f975cabc7f9fc9e462ebfd9532694f85" in skill_md
    assert "[motion quality rubric](references/motion-quality-rubric.md)" in skill_md
    assert "unscored" in skill_md and "unscored" in rubric_md
    assert "name: motion-director" in lite_md

    for link in re.findall(r"\]\(([^)]+)\)", skill_md):
        if "://" not in link and not link.startswith("#"):
            target = SKILL_DIR / link.split("#")[0]
            assert target.is_file(), f"broken relative link: {link}"


@pytest.mark.parametrize("case", EVALS["positive"], ids=lambda c: c["id"])
def test_positive_motion_tasks_lazy_load_motion_director(case: dict):
    result = route_skills(prompt=case["prompt"], mode=case["mode"], project_root=ROOT)
    assert "motion-director" in _names(result)
    no_mode_result = route_skills(prompt=case["prompt"], project_root=ROOT)
    assert "motion-director" in _names(no_mode_result)


@pytest.mark.parametrize("case", EVALS["negative"], ids=lambda c: c["id"])
def test_negative_backend_cli_docs_and_static_tasks_do_not_load_motion_director_and_add_zero_overhead(
    case: dict, tmp_path: Path
):
    config_with_motion = tmp_path / "with-motion.json"
    config_without_motion = tmp_path / "without-motion.json"
    doc = json.loads((ROOT / ".forgewright/skills-config.json").read_text(encoding="utf-8"))
    doc["context_budget"]["max_skill_descriptions_tokens"] = 20000
    config_with_motion.write_text(json.dumps(doc), encoding="utf-8")

    doc_no_motion = json.loads(json.dumps(doc))
    for mode_key, skills_list in doc_no_motion["auto_detect_rules"]["mode_skill_map"].items():
        doc_no_motion["auto_detect_rules"]["mode_skill_map"][mode_key] = [
            s for s in skills_list if s != "motion-director"
        ]
    doc_no_motion["skills"].pop("motion-director", None)
    config_without_motion.write_text(json.dumps(doc_no_motion), encoding="utf-8")

    res_with = route_skills(
        prompt=case["prompt"], mode=case["mode"], project_root=ROOT, config_path=config_with_motion
    )
    res_without = route_skills(
        prompt=case["prompt"], mode=case["mode"], project_root=ROOT, config_path=config_without_motion
    )
    assert "motion-director" not in _names(res_with)
    assert _names(res_with) == _names(res_without)
    assert res_with["context_budget"]["estimated_used"] == res_without["context_budget"]["estimated_used"]
    res_no_mode = route_skills(prompt=case["prompt"], project_root=ROOT, config_path=config_with_motion)
    assert "motion-director" not in _names(res_no_mode)


def test_backend_task_mentioning_gsap_version_does_not_load_motion_director():
    res = route_skills(
        prompt="Implement a backend REST endpoint that returns the GSAP package version string.",
        project_root=ROOT,
    )
    assert "motion-director" not in _names(res)


def test_behavioral_chromium_verifier_rejects_broken_touch_close_and_accepts_accessible_drawer(tmp_path: Path):
    verifier = ROOT / "scripts/runtime/verify_motion_drawer_artifact.mjs"
    bad_html = tmp_path / "broken-touch.html"
    bad_html.write_text(
        """<!doctype html><html><head><style>
        :root { --motion-duration: 180ms; --motion-ease: ease-out; }
        #inspector-drawer { position: fixed; inset: 0; opacity: 0; transform: translateX(100%); pointer-events: none; transition: opacity var(--motion-duration) var(--motion-ease), transform var(--motion-duration) var(--motion-ease); }
        #inspector-drawer.open { opacity: 1; transform: translateX(0); pointer-events: auto; }
        @media (prefers-reduced-motion: reduce) { #inspector-drawer { transition-duration: 0s !important; } }
        </style></head><body>
        <button id="drawer-toggle" aria-expanded="false" aria-controls="inspector-drawer">Toggle</button>
        <aside id="inspector-drawer" aria-hidden="true" inert><p>Covers toggle with no close button</p></aside>
        <script>
        const btn = document.getElementById("drawer-toggle");
        const drw = document.getElementById("inspector-drawer");
        function setOpen(v) { btn.setAttribute("aria-expanded", String(v)); drw.setAttribute("aria-hidden", String(!v)); if (v) { drw.removeAttribute("inert"); drw.classList.add("open"); } else { drw.setAttribute("inert", ""); drw.classList.remove("open"); } }
        btn.onclick = () => setOpen(btn.getAttribute("aria-expanded") !== "true");
        document.onkeydown = (e) => { if (e.key === "Escape") setOpen(false); };
        </script></body></html>""",
        encoding="utf-8",
    )
    res_bad = subprocess.run(
        ["node", str(verifier), str(bad_html)],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert res_bad.returncode == 1
    assert "mobile_touch_close_timeout_or_covered" in (res_bad.stderr + res_bad.stdout)

    good_html = tmp_path / "accessible-touch.html"
    good_html.write_text(
        bad_html.read_text(encoding="utf-8").replace(
            "<p>Covers toggle with no close button</p>",
            '<button id="drawer-close" type="button" onclick="setOpen(false)">Close</button>',
        ),
        encoding="utf-8",
    )
    res_good = subprocess.run(
        ["node", str(verifier), str(good_html)],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert res_good.returncode == 0, (res_good.stdout, res_good.stderr)
    assert json.loads(res_good.stdout.strip())["passed"] is True


def test_plugin_source_export_preserves_motion_director_and_relative_references(tmp_path: Path):
    spec = importlib.util.spec_from_file_location(
        "motion_plugin_export", ROOT / "scripts/ci/plugin_native_host.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    exported = tmp_path / "package"
    module.export_source_tree(ROOT, exported)
    for source in SKILL_DIR.rglob("*"):
        if not source.is_file():
            continue
        packaged = exported / source.relative_to(ROOT)
        assert packaged.is_file()
        assert packaged.read_bytes() == source.read_bytes()
