#!/usr/bin/env python3
"""Reverse-Engineering Intelligence for Forgewright.

Combines:
1. Pinned, offline-first discovery adapted from alexgaoth/awesome-reverse-engineered (re_index.py),
   enforcing SHA-256 provenance, zero network side effects, and license guardrail flags.
2. Task-to-tool capability routing adapted from morluto/awesome-reverse-engineering,
   surfacing explicit tool limitations, commercial flags, and fallback paths.
3. Canonical Evidence Facet envelopes (facet_availability, coverage.scope/status) and
   Process-Run-Token ownership adapted from morluto/rea (rea-agents v6.7.0).
4. Evidence-backed benchmark matrix evaluation ('who is stronger at what') across models and toolsets.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping, Sequence

RE_DISCOVERY_SCHEMA = "forgewright-re-discovery/v1"
REA_FACET_EVIDENCE_SCHEMA = "forgewright-rea-facet-evidence/v1"
PROCESS_RUN_TOKEN_SCHEMA = "forgewright-process-run-token/v1"
RE_BENCHMARK_SCHEMA = "forgewright-re-benchmark/v1"

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PINNED_CATALOG_PATH = ROOT / ".forgewright/re-discovery-catalog.json"
DEFAULT_PINNED_CATALOG_SHA256 = "8b95aaf79bbe8cdb89f63b5e640b66932c63775a0846c001dd780538e7794677"

SUPPORTED_FACETS = frozenset(
    {
        "pseudocode",
        "assembly",
        "comments",
        "callers",
        "callees",
        "references",
        "strings_names",
        "cfg",
        "manifest",
        "dex_bytecode",
        "web_bundle_assets",
    }
)
COVERAGE_SCOPES = frozenset({"root", "container-entries"})
COVERAGE_STATUSES = frozenset({"complete", "unknown"})
KNOWN_SPDX_LICENSES = frozenset(
    {
        "MIT",
        "Apache-2.0",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "ISC",
        "MPL-2.0",
        "LGPL-2.1",
        "LGPL-3.0",
        "GPL-2.0",
        "GPL-3.0",
        "AGPL-3.0",
        "Unlicense",
        "CC0-1.0",
    }
)
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

SYNONYMS: dict[str, list[str]] = {
    "apk": ["android", "dex", "jadx"],
    "aab": ["android", "dex", "jadx"],
    "decomp": ["decompilation", "decompiler"],
    "decompile": ["decompilation", "decompiler"],
    "ble": ["bluetooth"],
    "js": ["javascript", "bundle", "electron"],
}

CAPABILITY_MATRIX: dict[str, dict[str, Any]] = {
    "file_triage": {
        "task": "file_triage",
        "description": "Identify executable/archive format, compiler/packer markers, and security mitigations before deep analysis.",
        "primary_tools": [
            {
                "id": "capa",
                "repo": "https://github.com/mandiant/capa",
                "commercial": False,
                "limitations": "Rule hits indicate capability patterns, not malicious intent or runtime execution.",
            },
            {
                "id": "checksec",
                "repo": "https://github.com/slimm609/checksec",
                "commercial": False,
                "limitations": "Checks ELF PIE/RELRO/canary flags; mitigation flags are not a vulnerability verdict.",
            },
            {
                "id": "hexvero",
                "repo": "https://github.com/maximilianfeix/hexvero",
                "commercial": False,
                "limitations": "Requires Node.js 22.12+; pattern-based static JS analysis can miss dynamic/indirect code.",
            },
        ],
        "limitations": [
            "Static triage never certifies runtime behavior or absence of obfuscated payloads."
        ],
    },
    "android_apk_aab": {
        "task": "android_apk_aab",
        "description": "Inspect signed Android APK/AAB bundles, DEX classes, R8 mappings, and JavaScript bridges.",
        "primary_tools": [
            {
                "id": "rea-jadx-bridge",
                "repo": "https://github.com/morluto/rea",
                "commercial": False,
                "limitations": "Decompiled Java is an approximation of DEX bytecode; verify critical guards against javap/DEX.",
            },
            {
                "id": "bundletool-apksigner",
                "repo": "https://github.com/google/bundletool",
                "commercial": False,
                "limitations": "Validates bundle structure and signing certificates; does not certify live Play Store delivery or SDK fill.",
            },
        ],
        "limitations": [
            "Static APK/AAB inspection cannot certify physical-device FPS, live AdMob fill, or real Play Billing settlement."
        ],
    },
    "native_binary": {
        "task": "native_binary",
        "description": "Disassemble and decompile ELF, Mach-O, or PE native binaries and shared libraries (.so/.dylib).",
        "primary_tools": [
            {
                "id": "rea-ghidra-bridge",
                "repo": "https://github.com/morluto/rea",
                "commercial": False,
                "limitations": "Uses ephemeral Ghidra databases without mutating binaries; decompiler timeouts mark pseudocode unavailable.",
            },
            {
                "id": "ghidra-mcp",
                "repo": "https://github.com/bethington/ghidra-mcp",
                "commercial": False,
                "limitations": "Requires local Ghidra installation; complete static call graph does not cover indirect function pointers.",
            },
            {
                "id": "hopper",
                "repo": "https://www.hopperapp.com/",
                "commercial": True,
                "limitations": "Commercial license required for full use; missing reference-kind metadata prevents strict equality claims.",
            },
        ],
        "limitations": [
            "Static native decompilation does not prove dynamic control flow under runtime inputs."
        ],
    },
    "web_js_bundle": {
        "task": "web_js_bundle",
        "description": "Analyze packaged Vite/Webpack/Three.js/Phaser/Electron bundles and asset parity.",
        "primary_tools": [
            {
                "id": "rea-web-bundle-worker",
                "repo": "https://github.com/morluto/rea",
                "commercial": False,
                "limitations": "Static bundle inspection requires rendered headless/device verification for visual layout and shaders.",
            },
            {
                "id": "hexvero",
                "repo": "https://github.com/maximilianfeix/hexvero",
                "commercial": False,
                "limitations": "Pattern-based AST triage can miss dynamically constructed calls.",
            },
        ],
        "limitations": [
            "Bundle hash parity proves build reproducibility, not responsive visual layout."
        ],
    },
}


class REIntelligenceError(ValueError):
    """Raised when reverse-engineering discovery, evidence, or benchmark records violate guardrails."""


def _validate_canonical_json(value: Any, path: str = "root") -> None:
    """Recursively enforce string keys and finite JSON primitives before hashing."""
    if value is None or type(value) is bool or isinstance(value, str):
        return
    if type(value) is int:
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise REIntelligenceError(f"{path} must be a finite number")
        return
    if isinstance(value, (list, tuple)):
        for idx, item in enumerate(value):
            _validate_canonical_json(item, f"{path}[{idx}]")
        return
    if isinstance(value, Mapping):
        for k, v in value.items():
            if not isinstance(k, str):
                raise REIntelligenceError(f"{path} must use string keys only")
            _validate_canonical_json(v, f"{path}.{k}")
        return
    raise REIntelligenceError(f"{path} contains unsupported JSON type {type(value).__name__}")


def _canonical(value: Mapping[str, Any]) -> bytes:
    _validate_canonical_json(value)
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise REIntelligenceError("value is not canonically JSON-serializable") from exc


def _digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _hit(term: str, text: str) -> bool:
    if len(term) <= 3:
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None
    return term in text


def search_pinned_re_catalog(
    *,
    query: str,
    category: str | None = None,
    lang: str | None = None,
    min_stars: int = 0,
    include_archived: bool = False,
    limit: int = 10,
    catalog_path: Path = DEFAULT_PINNED_CATALOG_PATH,
    expected_sha256: str | None = DEFAULT_PINNED_CATALOG_SHA256,
) -> dict[str, Any]:
    """Deterministically search a local pinned catalog without network calls."""
    if not isinstance(query, str) or not query.strip():
        raise REIntelligenceError("query must be a non-empty string")
    path = Path(catalog_path)
    if not path.is_file():
        raise REIntelligenceError(f"pinned catalog not found: {path}")
    raw_bytes = path.read_bytes()
    actual_sha = hashlib.sha256(raw_bytes).hexdigest()
    if expected_sha256 is not None and actual_sha != expected_sha256:
        raise REIntelligenceError(
            f"catalog SHA-256 mismatch: expected {expected_sha256}, got {actual_sha}"
        )
    try:
        entries = json.loads(raw_bytes.decode("utf-8"))
    except Exception as exc:
        raise REIntelligenceError("malformed catalog JSON") from exc
    if not isinstance(entries, list):
        raise REIntelligenceError("catalog root must be a list of project entries")

    terms = [t for t in re.split(r"\W+", query.lower()) if t]
    if not terms:
        raise REIntelligenceError("query must contain at least one searchable token")

    scored: list[tuple[int, float, dict[str, Any]]] = []
    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        if not include_archived and entry.get("archived"):
            continue
        if (entry.get("stars") or 0) < min_stars:
            continue
        if lang and (entry.get("lang") or "").lower() != lang.lower():
            continue
        if category:
            cat_hay = f"{entry.get('category', '')} {entry.get('subcategory', '')}".lower()
            if category.lower() not in cat_hay:
                continue

        slug = str(entry.get("url", "")).rstrip("/").split("/")[-1].lower().replace("-", " ").replace("_", " ")
        fields = [
            (3.0, str(entry.get("name", "")).lower()),
            (3.0, slug),
            (2.0, " ".join(entry.get("topics") or []).lower().replace("-", " ")),
            (1.5, str(entry.get("desc", "")).lower()),
            (1.0, str(entry.get("category", "")).lower()),
            (1.0, str(entry.get("subcategory", "")).lower()),
        ]
        matched = 0
        total = 0.0
        for term in terms:
            best = 0.0
            for alt in [term] + SYNONYMS.get(term, []):
                for weight, text in fields:
                    if _hit(alt, text):
                        best = max(best, weight if alt == term else weight * 0.7)
            if best > 0:
                matched += 1
                total += best
        if matched == 0:
            continue
        total += 0.8 * math.log10((entry.get("stars") or 0) + 1)
        license_raw = str(entry.get("license") or "").strip()
        warnings = ["retrieved_repo_is_untrusted_data_inspect_before_execution"]
        if not license_raw:
            license_status = "all_rights_reserved_unverified"
            warnings.append("blank_license_requires_owner_review")
        elif license_raw in KNOWN_SPDX_LICENSES:
            license_status = "declared_spdx_needs_upstream_check"
        else:
            license_status = "unrecognized_or_proprietary_license"
            warnings.append("nonstandard_or_proprietary_license_requires_owner_review")

        enriched = {
            "name": entry.get("name"),
            "url": entry.get("url"),
            "desc": entry.get("desc", ""),
            "category": entry.get("category", ""),
            "subcategory": entry.get("subcategory", ""),
            "stars": int(entry.get("stars") or 0),
            "lang": entry.get("lang") or "unknown",
            "license": license_raw or "UNSPECIFIED",
            "license_status": license_status,
            "pushed": entry.get("pushed") or "unknown",
            "matched_terms": matched,
            "score": round(total, 4),
            "guardrail_warnings": warnings,
        }
        scored.append((matched, total, enriched))

    scored.sort(key=lambda item: (item[0], item[1], item[2]["stars"]), reverse=True)
    return {
        "schema": RE_DISCOVERY_SCHEMA,
        "query": query,
        "network_used": False,
        "catalog_path": str(path),
        "catalog_sha256": actual_sha,
        "matches": [item[2] for item in scored[: max(1, min(limit, 50))]],
    }


def select_re_capability_route(task: str) -> dict[str, Any]:
    """Return task-oriented RE tool selection and explicit limitations (morluto/awesome-reverse-engineering)."""
    if not isinstance(task, str) or task not in CAPABILITY_MATRIX:
        raise REIntelligenceError(
            f"unknown task '{task}'; supported tasks: {sorted(CAPABILITY_MATRIX)}"
        )
    return deepcopy(CAPABILITY_MATRIX[task])


def compile_rea_facet_evidence(
    *,
    artifact_path: str,
    artifact_sha256: str,
    adapter_id: str,
    adapter_version: str,
    coverage_scope: str,
    coverage_status: str,
    facet_availability: Mapping[str, Mapping[str, Any]],
    normalized_result: Mapping[str, Any],
    limitations: Sequence[str],
) -> dict[str, Any]:
    """Compile an REA-style Evidence envelope with per-facet availability and cache-reuse rules."""
    if not isinstance(artifact_path, str) or not artifact_path.strip():
        raise REIntelligenceError("artifact_path must be a non-empty string")
    if not isinstance(artifact_sha256, str) or not _SHA256_RE.fullmatch(artifact_sha256):
        raise REIntelligenceError("artifact_sha256 must be a 64-char lowercase hex SHA-256")
    if not isinstance(adapter_id, str) or not adapter_id.strip():
        raise REIntelligenceError("adapter_id must be a non-empty string")
    if not isinstance(adapter_version, str) or not adapter_version.strip():
        raise REIntelligenceError("adapter_version must be a non-empty string")
    if coverage_scope not in COVERAGE_SCOPES:
        raise REIntelligenceError(f"coverage_scope must be one of {sorted(COVERAGE_SCOPES)}")
    if coverage_status not in COVERAGE_STATUSES:
        raise REIntelligenceError(f"coverage_status must be one of {sorted(COVERAGE_STATUSES)}")
    if not isinstance(facet_availability, Mapping) or not facet_availability:
        raise REIntelligenceError("facet_availability must be a non-empty mapping")

    normalized_facets: dict[str, dict[str, Any]] = {}
    all_facets_available = True
    for facet, spec in facet_availability.items():
        if facet not in SUPPORTED_FACETS:
            raise REIntelligenceError(f"unsupported facet '{facet}'")
        if not isinstance(spec, Mapping) or type(spec.get("available")) is not bool:
            raise REIntelligenceError(f"facet '{facet}' must declare boolean 'available'")
        if spec["available"]:
            normalized_facets[facet] = {"available": True}
        else:
            all_facets_available = False
            reason = spec.get("reason")
            if not isinstance(reason, str) or not reason.strip():
                raise REIntelligenceError(
                    f"unavailable facet '{facet}' must include a non-empty reason"
                )
            normalized_facets[facet] = {"available": False, "reason": reason.strip()}

    if not isinstance(normalized_result, Mapping):
        raise REIntelligenceError("normalized_result must be a mapping")
    _validate_canonical_json(normalized_result, "normalized_result")
    if not isinstance(limitations, (list, tuple)) or any(
        not isinstance(item, str) or not item.strip() for item in limitations
    ):
        raise REIntelligenceError("limitations must be a sequence of non-empty strings")

    # Per REA contract: failed/unavailable facet observations or incomplete coverage skip snapshot cache reuse.
    cache_reusable = bool(all_facets_available and coverage_status == "complete")
    core = {
        "schema": REA_FACET_EVIDENCE_SCHEMA,
        "artifact_path": artifact_path.strip(),
        "artifact_sha256": artifact_sha256,
        "adapter": {"id": adapter_id.strip(), "version": adapter_version.strip()},
        "coverage": {"scope": coverage_scope, "status": coverage_status},
        "facet_availability": normalized_facets,
        "normalized_result": deepcopy(dict(normalized_result)),
        "limitations": [item.strip() for item in limitations],
        "cache_reusable": cache_reusable,
    }
    return {**core, "digest": _digest(core)}


def verify_rea_facet_evidence(record: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(record, Mapping) or record.get("schema") != REA_FACET_EVIDENCE_SCHEMA:
        raise REIntelligenceError("REA facet evidence schema mismatch")
    digest = record.get("digest")
    if not isinstance(digest, str) or not _SHA256_RE.fullmatch(digest):
        raise REIntelligenceError("malformed REA facet evidence digest")
    core = {k: deepcopy(v) for k, v in record.items() if k != "digest"}
    if _digest(core) != digest:
        raise REIntelligenceError("REA facet evidence digest mismatch")
    rebuilt = compile_rea_facet_evidence(
        artifact_path=core["artifact_path"],
        artifact_sha256=core["artifact_sha256"],
        adapter_id=core["adapter"]["id"],
        adapter_version=core["adapter"]["version"],
        coverage_scope=core["coverage"]["scope"],
        coverage_status=core["coverage"]["status"],
        facet_availability=core["facet_availability"],
        normalized_result=core["normalized_result"],
        limitations=core["limitations"],
    )
    if rebuilt != record:
        raise REIntelligenceError("REA facet evidence is not canonical")
    return rebuilt


def mint_process_run_token(
    *,
    pid: int,
    start_identity: str,
    lease_id: str,
    permitted_actions: Sequence[str],
) -> dict[str, Any]:
    """Mint an REA-style ProcessRunToken binding PID, process start identity, and host lease."""
    if type(pid) is not int or pid <= 0:
        raise REIntelligenceError("pid must be a positive integer")
    if not isinstance(start_identity, str) or not start_identity.strip():
        raise REIntelligenceError("start_identity must be a non-empty string")
    if not isinstance(lease_id, str) or not lease_id.strip():
        raise REIntelligenceError("lease_id must be a non-empty string")
    if not isinstance(permitted_actions, (list, tuple)) or not permitted_actions:
        raise REIntelligenceError("permitted_actions must be a non-empty sequence")
    cleaned_actions: list[str] = []
    for action in permitted_actions:
        if not isinstance(action, str) or not action.strip():
            raise REIntelligenceError("permitted_actions must contain non-empty action strings")
        cleaned_actions.append(action.strip())
    core = {
        "schema": PROCESS_RUN_TOKEN_SCHEMA,
        "pid": pid,
        "start_identity": start_identity.strip(),
        "lease_id": lease_id.strip(),
        "permitted_actions": sorted(set(cleaned_actions)),
    }
    return {**core, "token_id": _digest(core)}


def verify_process_run_token(
    token: Mapping[str, Any],
    *,
    expected_pid: int,
    expected_start_identity: str,
    expected_lease_id: str,
    required_action: str | None = None,
) -> dict[str, Any]:
    if not isinstance(token, Mapping) or token.get("schema") != PROCESS_RUN_TOKEN_SCHEMA:
        raise REIntelligenceError("process run token schema mismatch")
    token_id = token.get("token_id")
    if not isinstance(token_id, str) or not _SHA256_RE.fullmatch(token_id):
        raise REIntelligenceError("malformed token_id")
    if type(expected_pid) is not int or expected_pid <= 0:
        raise REIntelligenceError("expected_pid must be a positive integer")
    if not isinstance(expected_start_identity, str) or not expected_start_identity.strip():
        raise REIntelligenceError("expected_start_identity must be a non-empty string")
    if not isinstance(expected_lease_id, str) or not expected_lease_id.strip():
        raise REIntelligenceError("expected_lease_id must be a non-empty string")
    core = {k: deepcopy(v) for k, v in token.items() if k != "token_id"}
    if _digest(core) != token_id:
        raise REIntelligenceError("process run token digest mismatch")
    try:
        rebuilt = mint_process_run_token(
            pid=core["pid"],
            start_identity=core["start_identity"],
            lease_id=core["lease_id"],
            permitted_actions=core["permitted_actions"],
        )
    except (KeyError, TypeError) as exc:
        raise REIntelligenceError("token structure is invalid") from exc
    if rebuilt != token:
        raise REIntelligenceError("process run token is not canonical")
    if core.get("pid") != expected_pid:
        raise REIntelligenceError(f"process pid mismatch: expected {expected_pid}, got {core.get('pid')}")
    if core.get("start_identity") != expected_start_identity.strip():
        raise REIntelligenceError("process start_identity mismatch (possible PID reuse)")
    if core.get("lease_id") != expected_lease_id.strip():
        raise REIntelligenceError("process lease_id mismatch")
    if required_action is not None:
        if not isinstance(required_action, str) or not required_action.strip():
            raise REIntelligenceError("required_action must be a non-empty string when supplied")
        action_clean = required_action.strip()
        if action_clean not in core.get("permitted_actions", ()):
            raise REIntelligenceError(
                f"action '{action_clean}' not permitted by process run token"
            )
    return rebuilt


def _require_exact_int(value: Any, field: str, *, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise REIntelligenceError(f"{field} must be an integer >= {minimum}")
    return value


def _require_finite_number(
    value: Any,
    field: str,
    *,
    minimum: float = 0.0,
    maximum: float | None = None,
) -> float:
    if type(value) not in (int, float) or not math.isfinite(float(value)):
        raise REIntelligenceError(f"{field} must be a finite number")
    num = float(value)
    if num < minimum or (maximum is not None and num > maximum):
        bound = f"[{minimum}, {maximum}]" if maximum is not None else f">= {minimum}"
        raise REIntelligenceError(f"{field} must be within {bound}")
    return num


def evaluate_re_benchmark_matrix(
    runs: Sequence[Mapping[str, Any]],
    *,
    role: str,
) -> dict[str, Any]:
    """Evaluate models/toolsets ('who is stronger at what') with hard disqualification on fabricated evidence."""
    if not isinstance(runs, (list, tuple)) or not runs:
        raise REIntelligenceError("runs must be a non-empty sequence")
    if not isinstance(role, str) or not role.strip():
        raise REIntelligenceError("role must be a non-empty string")
    scored_rows: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
    for item in runs:
        if not isinstance(item, Mapping):
            raise REIntelligenceError("each run must be a mapping")
        if item.get("role") != role:
            continue
        cand_id = item.get("candidate_id")
        if not isinstance(cand_id, str) or not cand_id.strip():
            raise REIntelligenceError("candidate_id must be a non-empty string")
        total = _require_exact_int(item.get("tasks_total"), "tasks_total", minimum=1)
        passed = _require_exact_int(item.get("tasks_passed"), "tasks_passed", minimum=0)
        if passed > total:
            raise REIntelligenceError("invalid tasks_total / tasks_passed counts")
        pass_rate = passed / total
        completeness = _require_finite_number(
            item.get("evidence_completeness"), "evidence_completeness", minimum=0.0, maximum=1.0
        )
        calibration = _require_finite_number(
            item.get("coverage_calibration"), "coverage_calibration", minimum=0.0, maximum=1.0
        )
        unsupported = _require_exact_int(
            item.get("unsupported_claims"), "unsupported_claims", minimum=0
        )
        unauthorized = _require_exact_int(
            item.get("unauthorized_effects"), "unauthorized_effects", minimum=0
        )
        latency_ms = _require_finite_number(
            item.get("p95_latency_ms"), "p95_latency_ms", minimum=0.0
        )
        cost_usd = _require_finite_number(item.get("cost_usd"), "cost_usd", minimum=0.0)

        reasons: list[str] = []
        if unsupported > 0:
            reasons.append("unsupported_or_fabricated_claims")
        if unauthorized > 0:
            reasons.append("unauthorized_external_effects")

        disqualified = len(reasons) > 0
        composite = (
            0.0
            if disqualified
            else round(
                (pass_rate * 60.0)
                + (completeness * 25.0)
                + (calibration * 15.0)
                - min(5.0, latency_ms / 20000.0)
                - min(5.0, cost_usd * 2.0),
                4,
            )
        )
        # Full-precision lexicographic sort key: eligibility -> exact pass_rate -> completeness -> calibration -> latency -> cost
        sort_key = (
            not disqualified,
            pass_rate,
            completeness,
            calibration,
            -latency_ms,
            -cost_usd,
        )
        scored_rows.append(
            (
                sort_key,
            {
                    "candidate_id": cand_id.strip(),
                    "role": role,
                    "tasks_passed": passed,
                    "tasks_total": total,
                    "pass_rate": round(pass_rate, 6),
                    "evidence_completeness": round(completeness, 4),
                    "coverage_calibration": round(calibration, 4),
                    "p95_latency_ms": latency_ms,
                    "cost_usd": cost_usd,
                    "disqualified": disqualified,
                    "disqualification_reasons": reasons,
                    "composite_score": composite,
                },
            )
        )

    if not scored_rows:
        raise REIntelligenceError(f"no benchmark runs found for role '{role}'")

    scored_rows.sort(key=lambda pair: pair[0], reverse=True)
    rankings = [pair[1] for pair in scored_rows]
    eligible = [r for r in rankings if not r["disqualified"]]
    winner = eligible[0] if eligible else None
    report_core = {
        "schema": RE_BENCHMARK_SCHEMA,
        "role": role,
        "ranking_order": "lexicographic_full_precision(eligible, pass_rate, evidence_completeness, coverage_calibration, -p95_latency_ms, -cost_usd)",
        "winner": winner,
        "rankings": rankings,
    }
    return {**report_core, "digest": _digest(report_core)}
