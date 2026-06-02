---
name: hook-expert
description: >
  Auto-generated skill from git history analysis.
  Triggers on: auth,api,db,test,security,perf,ci,docs,ui,config,.
  Use when working with **/*.ts, **/*.js, **/*.sh files.
version: 0.1.0
author: forgewright-skill-creator
confidence: 0.75
source_commits: 10
source_date_range: 2026-03-04 14:29:10 +0700 to 2026-05-24 10:11:30 +0700
tags: [auto-generated, git-analysis]
---

# Hook-Expert

> Auto-generated from 10 commits analyzing hook-expert-related patterns.

**Confidence:** 0.75
**Based on:** 10 occurrences across 3+ months

## Trigger Patterns

### Keywords (detected from commit messages)
- auth,api,db,test,security,perf,ci,docs,ui,config,

### File Patterns
- **/*.ts
- - **/*.js
- - **/*.sh

## Common Operations

Extracted from commit patterns:

```
   1 refactor skill-maker
   1 add per-request
   1 add multica-orchestrator
   1 add multi-repo
   1 add gitnexus
   1 add Forgewright
   1 add cross-IDE
```

## Files Modified Together

These files are frequently modified in the same commits:

- `.antigravity/plugins/production-grade/AGENTS.md|.antigravity/plugins/production-grade/skills/production-grade/hooks/activation-rules.json|.cursor/agents/chat-interpreter.md|.cursor/agents/quality-reviewer.md|.cursor/agents/references/credit-killing-patterns.md|.cursor/agents/references/mode-classification.md|.cursor/agents/references/structured-request-examples.md|.cursor/agents/security-auditor.md|.cursor/agents/spec-reviewer.md|.cursor/agents/verifier.md|.cursor/rules/RULES.md|.github/README_RULES.md|skills/skill-maker/SKILL.md`
- `.git-nexus-test.txt`
- `.antigravity/plugins/board-ui/.gitignore|.antigravity/plugins/board-ui/next-env.d.ts|.antigravity/plugins/board-ui/next.config.mjs|.antigravity/plugins/board-ui/package-lock.json|.antigravity/plugins/board-ui/package.json|.antigravity/plugins/board-ui/plugin.json|.antigravity/plugins/board-ui/postcss.config.js|.antigravity/plugins/board-ui/README.md|.antigravity/plugins/board-ui/SKILL.md|.antigravity/plugins/board-ui/src/app/globals.css|.antigravity/plugins/board-ui/src/app/layout.tsx|.antigravity/plugins/board-ui/src/app/page.tsx|.antigravity/plugins/board-ui/src/components/AgentSidebar.tsx|.antigravity/plugins/board-ui/src/components/Board.tsx|.antigravity/plugins/board-ui/src/components/BoardProvider.tsx|.antigravity/plugins/board-ui/src/components/Column.tsx|.antigravity/plugins/board-ui/src/components/Header.tsx|.antigravity/plugins/board-ui/src/components/TaskCard.tsx|.antigravity/plugins/board-ui/src/hooks/useRealtime.ts|.antigravity/plugins/board-ui/src/lib/socket.ts|.antigravity/plugins/board-ui/src/lib/utils.ts|.antigravity/plugins/board-ui/src/store/board.ts|.antigravity/plugins/board-ui/tailwind.config.ts|.antigravity/plugins/board-ui/tsconfig.json|.antigravity/plugins/multica-orchestrator/docker-compose.yml|.antigravity/plugins/multica-orchestrator/Dockerfile|.antigravity/plugins/multica-orchestrator/Dockerfile.web|.antigravity/plugins/multica-orchestrator/multica_orchestrator/__init__.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/__init__.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/agent_manager.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/base.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/daemon.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/mmx_executor.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/multica_cli.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/progress_streamer.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/task_queue.py|.antigravity/plugins/multica-orchestrator/multica_orchestrator/scripts/terminal_ui.py|.antigravity/plugins/multica-orchestrator/plugin.json|.antigravity/plugins/multica-orchestrator/pyproject.toml|.antigravity/plugins/multica-orchestrator/README.md|.antigravity/plugins/multica-orchestrator/SKILL.md`
- `CLAUDE.md|scripts/forgewright-memory-hook.sh|scripts/memory-middleware.py|scripts/memory-session.sh`
- `.github/workflows/ci.yml|.gitignore|forgenexus/src/agents/citations.ts|forgenexus/src/agents/llm-client.test.ts|forgenexus/src/agents/llm-client.ts|forgenexus/src/agents/multi-agent.ts|forgenexus/src/agents/prompts.test.ts|forgenexus/src/agents/prompts.ts|forgenexus/src/agents/skeptic.ts|forgenexus/src/analysis/binding-verification.ts|forgenexus/src/analysis/enclosure-cache.ts|forgenexus/src/analysis/parallel.ts|forgenexus/src/analysis/parse-worker.ts|forgenexus/src/analysis/parser.ts|forgenexus/src/analysis/queries.ts|forgenexus/src/analysis/scanner.test.ts|forgenexus/src/analysis/scanner.ts|forgenexus/src/cli/evaluate.ts|forgenexus/src/cli/query.ts|forgenexus/src/cli/status.ts|forgenexus/src/data/db.ts|forgenexus/src/data/graph.test.ts|forgenexus/src/data/groups.ts|forgenexus/src/evaluation/dataset.ts|forgenexus/src/evaluation/runner.ts|forgenexus/src/mcp/tools/verify.ts|forgenexus/src/rag/chunker.ts|forgenexus/src/rag/hybrid-search.ts|forgenexus/src/rag/reranker.ts|forgenexus/src/rag/retriever.ts|package-lock.json|package.json|README.md|src/sandbox/__tests__/BypassDetector.test.ts|src/sandbox/__tests__/ConfigLoader.test.ts|src/sandbox/__tests__/FilesystemExecutor.test.ts|src/sandbox/__tests__/Integration.test.ts|src/sandbox/__tests__/PolicyEngine.test.ts|src/sandbox/config/default-config.yaml|src/sandbox/executors/FilesystemExecutor.ts|src/sandbox/executors/NetworkExecutor.ts|src/sandbox/executors/ShellExecutor.ts|src/sandbox/index.ts|src/sandbox/manager/ConfigLoader.ts|src/sandbox/manager/PolicyEngine.ts|src/sandbox/manager/SandboxManager.ts|src/sandbox/monitors/AuditLogger.ts|src/sandbox/monitors/BypassDetector.ts|src/sandbox/types/sandbox.ts|src/studio/__tests__/studio.test.ts|src/studio/components/Layout/StudioApp.tsx|src/studio/components/MemoryTrace/MemoryTrace.tsx|src/studio/components/PipelineMonitor/PipelineMonitor.tsx|src/studio/components/StatsPanel/StatsPanel.tsx|src/studio/hooks/usePipeline.ts|src/studio/hooks/useTokenTracker.ts|src/studio/index.ts|src/studio/server/eventEmitter.ts|src/studio/server/wsServer.ts|src/studio/types/studio.ts`

## Topic Clusters

Detected topics from commit analysis:

auth:4 api:0 db:2 test:2 security:0 perf:0 ci:1 docs:0 ui:1 config:0 general:0

## Directory Distribution

| Directory | Modifications |
|-----------|---------------|
| skills/production-grade/phases | 7 |
| forgenexus/src/data | 4 |
| src/studio/server | 2 |
| src/studio/hooks | 2 |
| skills/production-grade | 2 |

## Implementation Notes

- This skill was auto-generated from git history analysis
- Pattern confidence: 0.75 (based on 10 commits)
- Generated: 2026-06-02

## Verification Checklist

- [ ] Review trigger patterns match actual use cases
- [ ] Validate file patterns are correct
- [ ] Check common operations are accurate
- [ ] Adjust confidence score if needed

