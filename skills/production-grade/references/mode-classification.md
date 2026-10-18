# Mode Classification Reference

<!-- source: skills/production-grade/references/mode-classification.md -->

## Runtime selection and controller judgment

The local runtime uses `scripts/runtime/local_routing.py` (`local-en-vi-2`), a
bounded EN/VI lexical selector. Its `rule_score` counts matching rules and is
explicitly `rule-score-not-calibrated`: it is not a probability or a confidence
score between 0 and 1. There are no implemented fuzzy thresholds, stemming,
synonym expansion or automatic Explore → Feature → Full Build fallback chain.
Do not configure invented `skillRouting.fuzzyMatching` knobs.

Selection follows a trusted explicit mode, then a valid host-owned exact cache
entry when supplied, then lexical rules, otherwise `abstain`. Whole-word/phrase
matching and a single recognized task family can suggest a configured mode;
negation, uncertainty/policy language and independent competing families abstain.
Removing a competing mode from the shortlist does not resolve ambiguity. Prompt
text never supplies configuration, forced skills or permission. The route layer
still validates paths, disabled roles, engine compatibility and context limits.

An abstention requests controller interpretation, not a catch-all build. A
file-capable native parent inspects the actual request and current repository,
resolves only material unknowns, and may use the existing trusted explicit route
when intent is clear. It preserves genuine negation, policy boundaries and
unresolved conflicting goals. “Help me” in a precise request, two dependent steps
such as fix-and-test, or an omitted file path that repository inspection resolves
do not by themselves require a questionnaire. Ask when uncertainty changes
outcome, scope, risk, cost or a public contract; proceed on a reversible grounded
default when authorized.

### Game and novice interpretation

“Tôi không biết làm game. Hãy giúp tôi làm một game xếp hình 2D cho Android để
kinh doanh” expresses inexperience and affirmative intent. “Không tạo game. Chỉ
giải thích cách làm game” requests explanation only. The raw lexical selector
may abstain on both; never remove negation or treat a game keyword as execution
authority. Game plus market research can require both decision lenses without
permission to launch campaigns, install SDKs, export analytics or publish.

Read the **Phase Activation Contract** in
`skills/_shared/protocols/game-studio-pipeline.md` and follow
`workflows/game-studio-build.md`. Ground the engine/shell/pins first: Android
alone does not choose Unity; preserve existing Phaser 3, explicit native-engine
intent and native/React Native projects. New web 2D uses Phaser 4 and web 3D uses
Three.js. For a grounded web route, the existing command is:

```bash
python3 scripts/runtime/skill_routing.py --mode game-build --game-engine phaser4 --project-root . --config .forgewright/skills-config.json
```

Use `threejs` or `phaser3` only when applicable; these flags are web selectors,
not a replacement for explicit Unity/Godot/native routing. Run from the installed
framework with the actual project/config paths. Keep the current startup budget
of at most 12 overlays and 8,000 estimated tokens, exact deferred inventory and
one-time admitted loader semantics. A native host may use its existing trusted
file/route capability subject to that contract; never read around a denied or
unavailable controlled loader. Outside-inventory roles require a supported
trusted host route/load mechanism, otherwise the capability is BLOCKED. The
standalone Python LITE orchestrator routes once at startup and does not provide
automatic semantic re-entry or arbitrary role loading after abstention.

## Human-readable mode suggestions

The table is a guide for controller judgment, not the runtime rule catalog,
permission to load all listed roles, or a guaranteed execution capability.

| Mode | Trigger Signals | Skills Involved |
|------|----------------|-----------------|
| **Full Build** | "build a SaaS", "production grade", "from scratch", "full stack", greenfield intent | Applicable skills across DEFINE→BUILD→HARDEN→SHIP→SUSTAIN→GROW |
| **Feature** | "add [feature]", "implement [feature]", "new endpoint", "new page", "integrate [service]" | BA (if gaps detected) → PM (scoped) → Architect (scoped) → BE/FE → QA |
| **Harden** | "review", "audit", "secure", "harden", "before launch", "production ready" (on EXISTING code) | Security + QA + Code Review (sequential) → Remediation |
| **Ship** | "deploy", "CI/CD", "containerize", "infrastructure", "terraform", "docker" | DevOps → SRE |
| **Debug** | "debug", "fix bug", "broken", "investigate", "not working", "error", "trace", "crashes" | Debugger (→ Software/Frontend Engineer for fix) |
| **AI Build** | "AI feature", "chatbot", "RAG", "embeddings", "LLM", "agent", "prompt", "AI-powered" | AI Engineer + Prompt Engineer + Data Scientist + Architect (scoped) → BE/FE |
| **Migrate** | "migrate", "upgrade", "migration", "database change", "schema change", "refactor DB", "move to" | Database Engineer + Software Engineer → QA |
| **Test** | "write tests", "test coverage", "test this", "add tests" | QA |
| **Review** | "review my code", "code review", "code quality", "check my code" | Code Reviewer |
| **Architect** | "design", "architecture", "API design", "data model", "tech stack", "how should I structure" | Solution Architect |
| **Document** | "document", "write docs", "API docs", "README" | Technical Writer |
| **Explore** | "explain", "understand", "help me think", "what should I", "I'm not sure" | Polymath |
| **Research** | "research", "deep research", "find sources", "analyze topic", "investigate [domain]", "NotebookLM", "study materials", "generate quiz" | NotebookLM Researcher → Polymath (research mode) + NotebookLM MCP (primary) |
| **Optimize** | "performance", "slow", "optimize", "scale", "reliability" | Performance Engineer + SRE + Code Reviewer |
| **Design** | "design UI", "wireframes", "design system", "color palette", "UX flow" | UX/research → Concept Artist → Art Director → UI/technical handoff |
| **Mobile** | "mobile app", "React Native", "Flutter", "iOS", "Android" | BA (if gaps detected) → Mobile Engineer (+ PM scoped, Architect scoped if needed) |
| **Game Build** | "game", "Unity", "Unreal", "Godot", "Roblox", "Phaser", "Three.js", "gameplay", "game design", "build a game" | UX/research → Concept Artist → Art Director → UI/technical/engine handoff → Level/Narrative/TechArt/Audio |
| **XR Build** | "VR", "AR", "MR", "XR", "spatial", "Quest", "Vision Pro", "WebXR" | XR Engineer (+ Game Build pipeline if game-like XR) |
| **Marketing** | "marketing", "SEO", "launch strategy", "copywriting", "content strategy", "go-to-market" | Growth Marketer (+ Conversion Optimizer if CRO mentioned) |
| **Grow** | "growth", "CRO", "conversion", "funnel", "A/B test", "churn", "retention", "referral" | Conversion Optimizer (+ Growth Marketer if strategy needed) |
| **Analyze** | "analyze requirements", "evaluate this", "is this feasible", "validate requirements", "check completeness", "client says" | Business Analyst (standalone requirements analysis) |
| **Auto-Publish** | "auto publish", "publish store", "publish apple", "publish google play", "release app" | Auto-Publish |
| **Goal** | "set goal", "work toward", "keep going until", "autonomous", "/goal" | Goal-Driven orchestrator — auto-evaluate and continue until condition met |
| **Custom** | Doesn't fit above patterns | Present skill menu, let user pick |

**Step 2 — Choose the smallest interaction needed:**

- `QUICK` or obvious single-role work: execute after a mini-plan; do not ask for plan approval unless a material preference/gate exists.
- `STANDARD` multi-role work: communicate the concise plan and material trade-offs; proceed autonomously when choices are reversible and within the user's delegated scope.
- `DEEP` / contractual / release-critical work: surface major trade-offs and obtain approval only at actual human decision gates.

Never offer "run every skill/phase" as a quality upgrade. More roles are not inherently better; route only the capabilities required by acceptance and risk.

For UI work, reuse the current design system/reference first. Offer a `DESIGN.md` template only for a major new identity/redesign where no current visual system exists.

Use persistent Antigravity planning only when multi-lane coordination or durable architecture planning actually benefits from it; component count alone is not a trigger.
