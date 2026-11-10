"""RF11 integration tests for motion-director skill: lazy routing, zero non-motion overhead, packaging, and rubric boundaries."""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import time
from contextlib import contextmanager
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


@contextmanager
def _owned_macos_user_active_assertion(timeout_seconds: int = 90):
    proc = None
    if sys.platform == "darwin" and Path("/usr/bin/caffeinate").is_file():
        proc = subprocess.Popen(
            ["/usr/bin/caffeinate", "-d", "-u", "-t", str(timeout_seconds)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.05)
    try:
        yield proc
    finally:
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)


def _verifier_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ.copy()
    staged_browsers = ROOT / ".forgewright/runtime/fw-argon-macfix-20261110/browsers-160"
    if "PLAYWRIGHT_BROWSERS_PATH" not in env and staged_browsers.is_dir():
        env["PLAYWRIGHT_BROWSERS_PATH"] = str(staged_browsers)
    if extra:
        env.update(extra)
    return env


def _run_verifier(
    html_path: Path,
    extra_env: dict[str, str] | None = None,
    timeout: int = 35,
    with_user_active: bool = True,
) -> tuple[subprocess.CompletedProcess[str], dict]:
    verifier = ROOT / "scripts/runtime/verify_motion_drawer_artifact.mjs"
    if with_user_active:
        with _owned_macos_user_active_assertion(max(15, timeout)):
            proc = subprocess.run(
                ["node", str(verifier), str(html_path)],
                cwd=str(ROOT),
                env=_verifier_env(extra_env),
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
    else:
        proc = subprocess.run(
            ["node", str(verifier), str(html_path)],
            cwd=str(ROOT),
            env=_verifier_env(extra_env),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    combined_lines = [line.strip() for line in (proc.stdout + "\n" + proc.stderr).splitlines() if line.strip()]
    assert len(combined_lines) == 1, f"Expected exactly 1 terminal JSON line, got {len(combined_lines)}: stdout={proc.stdout!r} stderr={proc.stderr!r}"
    payload = json.loads(combined_lines[0])
    return proc, payload


POSITIVE_DRAWER_HTML = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
:root { --motion-duration: 180ms; --motion-ease: cubic-bezier(0.22, 1, 0.36, 1); }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
#drawer-toggle, #drawer-close { min-height: 44px; min-width: 44px; padding: 8px 16px; cursor: pointer; }
#inspector-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: min(320px, 100vw);
  background: #1e293b; padding: 20px;
  opacity: 0; transform: translateX(100%); pointer-events: none;
  transition: opacity var(--motion-duration) var(--motion-ease), transform var(--motion-duration) var(--motion-ease), outline-color var(--motion-duration) var(--motion-ease);
  outline: 1px solid transparent;
}
#inspector-drawer.open { opacity: 1; transform: translateX(0); pointer-events: auto; }
@media (max-width: 600px) {
  #inspector-drawer { width: 100vw; left: 0; }
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-duration: 0s; }
  #inspector-drawer, #inspector-drawer.open { transition-duration: 0s !important; }
}
</style></head><body>
<button id="drawer-toggle" type="button" aria-expanded="false" aria-controls="inspector-drawer">Toggle</button>
<aside id="inspector-drawer" aria-hidden="true" inert>
  <button id="drawer-close" type="button">Close</button>
</aside>
<script>
const btn = document.getElementById("drawer-toggle");
const closeBtn = document.getElementById("drawer-close");
const drw = document.getElementById("inspector-drawer");
function setOpen(v, restoreFocus) {
  btn.setAttribute("aria-expanded", String(v));
  drw.setAttribute("aria-hidden", String(!v));
  if (v) {
    drw.removeAttribute("inert");
    drw.inert = false;
    drw.classList.add("open");
  } else {
    drw.setAttribute("inert", "");
    drw.inert = true;
    drw.classList.remove("open");
    if (restoreFocus) btn.focus();
  }
}
btn.addEventListener("click", () => setOpen(btn.getAttribute("aria-expanded") !== "true", false));
if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false, true));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
    setOpen(false, true);
  }
});
</script></body></html>"""


def test_behavioral_chromium_verifier_rejects_broken_touch_close_and_accepts_accessible_drawer(tmp_path: Path):
    with _owned_macos_user_active_assertion(120):
        # 1. Positive accessible drawer fixture passes all desktop + mobile + generation-bound reversal checks
        good_html = tmp_path / "accessible-touch.html"
        good_html.write_text(POSITIVE_DRAWER_HTML, encoding="utf-8")
        res_good, payload_good = _run_verifier(good_html)
        assert res_good.returncode == 0, payload_good
        assert payload_good["passed"] is True
        assert payload_good["cleanupErrors"] == []
        assert payload_good["browserInfo"]["playwrightVersion"] == "1.60.0"
        assert payload_good["browserInfo"]["channel"] == "default-bundled-headless-shell"
        assert payload_good["browserInfo"]["actualLaunchExecutable"] == "unknown"
        assert payload_good["browserInfo"]["physicalPerformanceEligible"] is False
        assert payload_good["browserInfo"]["physicalPerformanceScore"] == "unscored"
        if sys.platform == "darwin":
            assert payload_good["browserInfo"]["requestedLaunchArgs"] == ["--disable-frame-rate-limit"]
            assert payload_good["browserInfo"]["profile"] == "darwin-default-headless-shell-unthrottled-beginframe"
        else:
            assert payload_good["browserInfo"]["requestedLaunchArgs"] == []
            assert payload_good["browserInfo"]["profile"] == "default-bundled-headless-shell"
        assert isinstance(payload_good["browserInfo"]["bundledChromiumCandidatePath"], str)
        assert payload_good["checks"]["desktopKeyboardOpenClose"] == "PASS"
        assert payload_good["checks"]["desktopEscapeFocusRestore"] == "PASS"
        assert payload_good["checks"]["desktopMidTransitionReversal"] == "PASS"
        assert payload_good["checks"]["desktopRapidInterruption"] == "PASS"
        assert payload_good["checks"]["mobileTouchOpen"] == "PASS"
        assert payload_good["checks"]["mobileTouchClose"] == "PASS"
        assert len(payload_good["reversals"]) == 2
        for rev in payload_good["reversals"]:
            assert rev["activeAtInput"] is True
            assert rev["sameGenerationCancelledOrReversed"] is True
            assert len(rev["activeAnimations"]) >= 2
            for anim in rev["activeAnimations"]:
                assert anim["finishedOutcome"] == "aborted"
                assert anim["interruptedBeforeCompletion"] is True

        # 2. Mobile-only broken close fixture: passes desktop, reduced-motion, and mobile touch open, fails at touch close
        mobile_bad_html = tmp_path / "broken-mobile-touch-only.html"
        mobile_bad_html.write_text(
            POSITIVE_DRAWER_HTML.replace(
                '<button id="drawer-close" type="button">Close</button>',
                "<p>Covers toggle on mobile viewport with no close button</p>",
            ),
            encoding="utf-8",
        )
        res_mobile_bad, payload_mobile_bad = _run_verifier(mobile_bad_html)
        assert res_mobile_bad.returncode == 1
        assert payload_mobile_bad["passed"] is False
        assert payload_mobile_bad["failedCheck"] == "mobile_touch_close_timeout_or_covered"
        assert payload_mobile_bad["checks"]["desktopKeyboardOpenClose"] == "PASS"
        assert payload_mobile_bad["checks"]["desktopEscapeFocusRestore"] == "PASS"
        assert payload_mobile_bad["checks"]["desktopMidTransitionReversal"] == "PASS"
        assert payload_mobile_bad["checks"]["desktopRapidInterruption"] == "PASS"
        assert payload_mobile_bad["checks"]["mobileReducedMotionDuration"] == "0s"
        assert payload_mobile_bad["checks"]["mobileTouchOpen"] == "PASS"
        assert payload_mobile_bad["checks"]["buttonsInsideDrawer"] == 0

        # 3. Broken Escape despite working click-close must fail without fallback click rescue
        broken_escape_html = tmp_path / "broken-escape.html"
        broken_escape_html.write_text(
            POSITIVE_DRAWER_HTML.replace(
                'if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {',
                "if (false) {",
            ),
            encoding="utf-8",
        )
        res_escape_bad, payload_escape_bad = _run_verifier(broken_escape_html)
        assert res_escape_bad.returncode == 1
        assert payload_escape_bad["passed"] is False
        assert payload_escape_bad["failedCheck"] == "desktop_escape_close"

        # 4. Broken focus restore on Escape must fail
        broken_focus_html = tmp_path / "broken-focus.html"
        broken_focus_html.write_text(
            POSITIVE_DRAWER_HTML.replace(
                "if (restoreFocus) btn.focus();",
                "// broken focus restore",
            ),
            encoding="utf-8",
        )
        res_focus_bad, payload_focus_bad = _run_verifier(broken_focus_html)
        assert res_focus_bad.returncode == 1
        assert payload_focus_bad["passed"] is False
        assert payload_focus_bad["failedCheck"] == "desktop_escape_focus_restore"

        # 5. No-motion fixture on desktop must fail
        no_motion_html = tmp_path / "no-motion.html"
        no_motion_html.write_text(
            POSITIVE_DRAWER_HTML.replace(
                "--motion-duration: 180ms;",
                "--motion-duration: 0s;",
            ),
            encoding="utf-8",
        )
        res_no_motion, payload_no_motion = _run_verifier(no_motion_html)
        assert res_no_motion.returncode == 1
        assert payload_no_motion["passed"] is False
        assert payload_no_motion["failedCheck"] == "desktop_no_motion"

        # 6. C1 negative: handler defers opacity/transform class reversal until transitionend while firing an unrelated transitioncancel on #inspector-drawer
        deferred_handler_html = tmp_path / "deferred-until-transitionend.html"
        deferred_handler_html.write_text(
            POSITIVE_DRAWER_HTML.replace(
                """function setOpen(v, restoreFocus) {
  btn.setAttribute("aria-expanded", String(v));
  drw.setAttribute("aria-hidden", String(!v));
  if (v) {
    drw.removeAttribute("inert");
    drw.inert = false;
    drw.classList.add("open");
  } else {
    drw.setAttribute("inert", "");
    drw.inert = true;
    drw.classList.remove("open");
    if (restoreFocus) btn.focus();
  }
}""",
                """let flipCount = 0;
function applyVisualOpen(v) {
  if (v) drw.classList.add("open");
  else drw.classList.remove("open");
}
function setOpen(v, restoreFocus) {
  flipCount += 1;
  btn.setAttribute("aria-expanded", String(v));
  drw.setAttribute("aria-hidden", String(!v));
  if (v) {
    drw.removeAttribute("inert");
    drw.inert = false;
  } else {
    drw.setAttribute("inert", "");
    drw.inert = true;
    if (restoreFocus) btn.focus();
  }
  const running = drw.getAnimations().filter((a) => a.playState === "running" && (a.transitionProperty === "opacity" || a.transitionProperty === "transform"));
  if (flipCount === 4) {
    drw.style.outlineColor = "rgb(255, 0, 0)";
  }
  if (flipCount >= 5 && running.length > 0) {
    // Trigger a real transitioncancel on an unrelated drawer property (outline-color) while deferring opacity/transform until transitionend
    drw.style.outlineColor = "rgb(0, 255, 0)";
    void getComputedStyle(drw).outlineColor;
    drw.addEventListener("transitionend", function onEnd(ev) {
      if (ev.propertyName === "opacity" || ev.propertyName === "transform") {
        drw.removeEventListener("transitionend", onEnd);
        applyVisualOpen(v);
      }
    });
    return;
  }
  applyVisualOpen(v);
}""",
            ),
            encoding="utf-8",
        )
        res_deferred, payload_deferred = _run_verifier(deferred_handler_html)
        assert res_deferred.returncode == 1
        assert payload_deferred["passed"] is False
        assert payload_deferred["failedCheck"] == "desktop_mid_transition_reversal"

        # 7. C2 regressions: missing file, cleanup failure, never-resolving close, and RAF starvation
        res_missing, payload_missing = _run_verifier(tmp_path / "does-not-exist.html", with_user_active=False)
        assert res_missing.returncode == 1
        assert payload_missing["passed"] is False
        assert payload_missing["failedCheck"] == "file_missing"

        res_cleanup_hang, payload_cleanup_hang = _run_verifier(
            good_html,
            extra_env={
                "FORGEWRIGHT_MOTION_VERIFIER_FAULT_INJECT": "cleanup_multi_fault",
                "FORGEWRIGHT_MOTION_VERIFIER_CLOSE_TIMEOUT_MS": "150",
            },
        )
        assert res_cleanup_hang.returncode == 1
        assert payload_cleanup_hang["passed"] is False
        assert payload_cleanup_hang["failedCheck"] == "cleanup_failed"
        assert any("injected_context_close_failure" in e for e in payload_cleanup_hang["cleanupErrors"])
        assert any("browser_close_timeout_after_150ms" in e for e in payload_cleanup_hang["cleanupErrors"])
        assert any("server_close_timeout_after_150ms" in e for e in payload_cleanup_hang["cleanupErrors"])
        assert any("server_force_reclaim_timeout_after_150ms" in e for e in payload_cleanup_hang["cleanupErrors"])

        # Retain original typed failure when primary check fails AND context.close never resolves
        res_primary_plus_hang, payload_primary_plus_hang = _run_verifier(
            no_motion_html,
            extra_env={
                "FORGEWRIGHT_MOTION_VERIFIER_FAULT_INJECT": "context_close_hang",
                "FORGEWRIGHT_MOTION_VERIFIER_CLOSE_TIMEOUT_MS": "150",
            },
            with_user_active=False,
        )
        assert res_primary_plus_hang.returncode == 1
        assert payload_primary_plus_hang["passed"] is False
        assert payload_primary_plus_hang["failedCheck"] == "desktop_no_motion"
        assert any("context_close_timeout_after_150ms" in e for e in payload_primary_plus_hang["cleanupErrors"])

        res_raf_starve, payload_raf_starve = _run_verifier(
            good_html,
            extra_env={
                "FORGEWRIGHT_MOTION_VERIFIER_FAULT_INJECT": "raf_starvation",
                "FORGEWRIGHT_MOTION_VERIFIER_RAF_TIMEOUT_MS": "150",
            },
            with_user_active=False,
        )
        assert res_raf_starve.returncode == 1
        assert payload_raf_starve["passed"] is False
        assert payload_raf_starve["failedCheck"] == "raf_starvation_timeout"
        assert payload_raf_starve["cleanupErrors"] == []


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


def test_shared_playwright_chromium_profile_and_revision_binding():
    probe = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            (
                "import { resolveChromiumFunctionalProfile } from './scripts/runtime/playwright_chromium.mjs';"
                "console.log(JSON.stringify({"
                "darwinDefault: resolveChromiumFunctionalProfile({ channel: '', platform: 'darwin' }),"
                "winDefault: resolveChromiumFunctionalProfile({ channel: '', platform: 'win32' }),"
                "linuxDefault: resolveChromiumFunctionalProfile({ channel: '', platform: 'linux' }),"
                "darwinExplicit: resolveChromiumFunctionalProfile({ channel: 'chrome', platform: 'darwin' })"
                "}));"
            ),
        ],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=10,
        check=True,
    )
    profiles = json.loads(probe.stdout.strip())
    assert profiles["darwinDefault"]["launchArgs"] == ["--disable-frame-rate-limit"]
    assert profiles["darwinDefault"]["profile"] == "darwin-default-headless-shell-unthrottled-beginframe"
    assert profiles["darwinDefault"]["physicalPerformanceEligible"] is False
    assert profiles["darwinDefault"]["physicalPerformanceScore"] == "unscored"
    assert profiles["darwinDefault"]["actualLaunchExecutable"] == "unknown"
    assert profiles["winDefault"]["launchArgs"] == []
    assert profiles["winDefault"]["profile"] == "default-bundled-headless-shell"
    assert profiles["linuxDefault"]["launchArgs"] == []
    assert profiles["darwinExplicit"]["launchArgs"] == []
    assert profiles["darwinExplicit"]["channel"] == "chrome"
    assert profiles["darwinExplicit"]["profile"] == "explicit-channel-override"

    spec = importlib.util.spec_from_file_location(
        "verify_platform_key_check", ROOT / "scripts/ci/verify-platform.py"
    )
    assert spec and spec.loader
    ci_dir = str(ROOT / "scripts/ci")
    if ci_dir not in sys.path:
        sys.path.insert(0, ci_dir)
    vp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vp)
    assert "scripts/runtime/playwright_chromium.mjs" in vp.KEY_REVISION_FILES
    assert len(vp.KEY_REVISION_FILES) == 36
