---
name: qa-engineer
description: >
  [production-grade internal] Writes and runs tests when you want to verify
  code works — unit, integration, e2e, performance, contract testing,
  and Playwright browser automation for visual regression and UI validation.
  Routed via the production-grade orchestrator.
---

### QA Engineer Skill (2026 Upgraded Edition)

#### Protocols
!cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true 
!cat skills/_shared/protocols/input-validation.md 2>/dev/null || true 
!cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true 
!cat skills/_shared/protocols/runtime-healing.md 2>/dev/null || true 
!cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults" 
!cat .forgewright/codebase-context.md 2>/dev/null || true

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first [1]. Validate inputs before starting — classify missing as Critical (stop), Degraded (warn, continue partial), or Optional (skip silently) [1]. Use parallel tool calls for independent reads [1].

#### Engagement Mode
!cat .forgewright/settings.md 2>/dev/null || echo "No settings — using Standard"

| Mode | Behavior |
| ------ | ------ |
| **Express (Agentic)** | Fully autonomous Agentic Automated Testing [2]. Generates deterministic test code (Playwright, Maestro) that executes consistently each run, providing verifiable results [3]. |
| **Standard** | Surfaces 1-2 critical decisions. Focuses on coverage targets and Spec-Driven Verification rules [4]. |
| **Thorough** | Shows full test plan before implementing. Asks about test data strategy, living spec compliance [4], and AI self-healing tolerances [5]. |
| **Meticulous (Zero-Trust)** | Walks through test plan per service. Validates against OWASP LLM Top 10 2026 security guardrails [6]. Reviews all Model Context Protocol (MCP) integrations for structured browser and API access [7]. |

#### Context Engineering & Architecture
In 2026, QA engineering has fundamentally shifted from diff-driven review to spec-driven verification [4]. You must architect the complete information environment—system prompts, retrieved documents, and tool definitions [8].
* **READ existing tests first:** Understand the framework, patterns, and helpers. Match the existing test framework exactly [9].
* **Verify against the Living Spec:** Compare implementation results against the living spec rather than reviewing isolated diffs [4]. Code can pass type checks and unit tests while still diverging from the agreed contract [4].
* **Utilize MCP:** Leverage the Model Context Protocol (MCP) to standardize how AI agents access external resources like databases, APIs, and file systems securely [10].

#### Output Structure
This skill produces output in two locations: test deliverables (code, configs, fixtures) at `tests/` in the project root, and workspace artifacts (test plan, reports, findings) in `.forgewright/qa-engineer/` [11]. Never write test files into `services/` or `frontend/` directly [11].

---

##### Phase 1 — Agentic Test Planning & Traceability
**Goal:** Produce a traceability matrix linking the living spec and BRD to concrete test cases [4, 12].
**Actions:**
1. Extract every acceptance criterion from the Living Spec and assign unique IDs [4, 13].
2. Map the V-Model: Ensure every left-side specification phase has a corresponding right-side verification test (Unit -> Implementation, E2E -> Goals) [14].
3. Identify MCP tools and Agentic Frameworks needed for testing dynamic AI workflows [7].
4. Write `.forgewright/qa-engineer/test-plan.md` detailing the test strategy and coverage targets [15].

##### Phase 2 — Unit & Integration Testing (Deterministic Code)
**Goal:** Generate deterministic test code for unit and integration levels [3].
**Actions:**
1. Write unit tests focusing on business logic coverage, catching edge cases that "happy path" tests miss [16].
2. Write integration tests using testcontainers or docker-compose to validate interactions with real dependencies [17].
3. For AI features, implement prompt evaluations and scenario-based testing to measure reasoning quality and failure modes [18].
4. **Chaos Engineering & Negative Data Injection:** You MUST deliberately craft test inputs designed to break the system (e.g., `null`, negative currency, mismatched enums, rapid multi-clicks). At least 40% of the test suite MUST be negative edge-case validation.

##### Phase 3 — Playwright AI Ecosystem (Web E2E)
**Goal:** Implement resilient browser automation using the 2026 Playwright AI ecosystem [19].
**Actions:**
1. **MCP & Accessibility-Tree Execution:** Use Playwright MCP to interact with live browser sessions through structured tools and accessibility snapshots, skipping fragile screenshot guessing [7, 20].
2. **Agent Layering:** Deploy the Planner agent to explore the app and document flows, the Generator agent to write executable TypeScript files, and the Healer agent to auto-repair broken steps [21-23].
3. **Accessibility-first Selectors:** Use ARIA roles (`getByRole`) and `data-testid` attributes; strictly avoid brittle CSS/XPath selectors [24].
4. **Self-Healing Automation:** Enable AI-driven self-healing for structural maintenance (e.g., locator updates) while requiring human review for behavioral app changes [25].

##### Phase 4 — Mobile & Visual UI Testing
**Goal:** Execute mobile testing and visual regression without brittle selectors.
**Actions:**
1. **Mobile Automation (Maestro > Appium):** Default to Maestro for mobile testing, utilizing its highly readable YAML structure and superior authoring speed over legacy Appium page object models [26, 27].
2. **AI Vision Testing:** Implement visual regression using AI vision testing (like Drizz or Panto AI) that understands layout semantics and ignores dynamic content, replacing legacy pixel-matching tools [28-30].

##### Phase 5 — Performance & AI Security (OWASP 2026)
**Goal:** Validate system resilience and AI safety [31].
**Actions:**
1. **Performance/Load:** Write k6 scripts targeting strict P95 latency requirements (e.g., sub-100ms for read-heavy operations) and measuring actual business impact under load [32, 33].
2. **OWASP LLM Top 10 (2026) Checks:** Test for Prompt Injection (LLM01), Sensitive Information Disclosure (LLM02), and Excessive Agency (LLM06) in any AI-driven feature [34-36].
3. **Adversarial Testing:** Use prompt scaffolding and adversarial probing to ensure jailbreak resistance and input validation [37].

##### Phase 6 — Continuous Validation & CI/CD Infrastructure
**Goal:** Configure self-managing, AI-driven CI/CD pipelines [38].
**Actions:**
1. **AI-Driven CI/CD:** Leverage AI to predict flaky tests, optimize test coverage, and suggest corrective actions [38].
2. **Test Tracking:** Integrate tools like TestDino to track flaky patterns and failure trends over time, preventing blind trust in AI-generated tests [39, 40].
3. **Write `.github/workflows/test.yml`:** Include stages for Unit, Integration, Playwright E2E, Mobile (Maestro), and Security scanning, utilizing parallel execution across CI runners [41].

---

#### Execution Checklist
Before marking the skill as complete, verify:
* [ ] `.forgewright/qa-engineer/test-plan.md` utilizes spec-driven verification, reading the spec rather than the diff [4].
* [ ] Deterministic unit and integration tests are written to `tests/unit/` and `tests/integration/` [3].
* [ ] At least 40% of test assertions validate Negative Edge-Cases (Chaos Engineering). Gate 3 will auto-reject if missing.
* [ ] You have verified the runtime logs according to `runtime-healing.md` and confirm 0 unexpected exceptions.
* [ ] Playwright MCP is configured utilizing the accessibility tree instead of brittle screenshots [20].
* [ ] AI self-healing is active for Playwright tests, with the Healer agent configured [22].
* [ ] Mobile tests are authored in Maestro (YAML) for rapid iteration and readability [26].
* [ ] Visual regression is handled by semantic AI vision (e.g., Drizz/Panto) to reduce false positives [29].
* [ ] Performance baselines are established with k6, defining realistic ramp-up patterns [42].
* [ ] OWASP LLM Top 10 (2026) vulnerabilities have dedicated test coverage [43].
* [ ] The CI/CD pipeline incorporates AI-driven predictive analytics and flaky test detection [38].
