# Antigravity Usage Tracking - Scope Definition

## Overview

Track AI usage (token, cost, model) from multiple platforms into unified dashboard, with per-project breakdown. Designed for cross-platform usage (Cursor, Claude Code, CLI, etc.).

## Problem Statement

Current token tracking only works within Forgewright context. User wants:
1. Track usage across ALL AI assistant platforms
2. Per-project breakdown (not just Forgewright projects)
3. Unified dashboard showing total AI spend
4. Cross-platform analysis (compare Cursor vs Claude Code usage)

## Tracked Platforms

### Primary Sources

| Platform | Data Type | Feasibility | Data Location |
|----------|-----------|-------------|---------------|
| **Cursor** | Model calls, conversations, files | ✅ HIGH | `~/.cursor/ai-tracking/ai-code-tracking.db` |
| **Claude Code** | Sessions, models, env | ✅ HIGH | `~/.claude/telemetry/*.json` |
| **Forgewright** | Tokens, cost, skill, mode | ✅ HIGH | `~/.forgewright/usage/{project}/*.jsonl` |

### Future Sources (v2)

| Platform | Data Type | Feasibility | Notes |
|----------|-----------|-------------|-------|
| **Windsurf** | Code completions | ⚠️ MEDIUM | Requires API access |
| **VS Code Copilot** | Token usage | ⚠️ MEDIUM | Limited API |
| **GitHub Copilot** | Token usage | ⚠️ MEDIUM | Enterprise API needed |
| **Ollama** | Local model usage | ✅ HIGH | Log file parsing |

## Data Model

### UnifiedUsageRecord

```typescript
interface UnifiedUsageRecord {
  timestamp: Date;
  platform: 'cursor' | 'claude-code' | 'forgewright' | 'ollama';
  sessionId: string;
  project: string;
  projectPath: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'google' | 'local';
  
  // Metrics (may be estimated)
  calls: number;           // Always available
  inputTokens?: number;    // Forgewright only
  outputTokens?: number;   // Forgewright only
  estimatedTokens?: number; // For platforms without token counts
  
  // Computed
  estimatedCost: number;
  
  // Metadata
  mode?: string;           // Feature, Build, etc.
  skill?: string;          // Software engineer, QA, etc.
}
```

## Features

### Core Features (v1)

- [ ] **Multi-Platform Reader**: Read from Cursor DB, Claude telemetry, Forgewright logs
- [ ] **Unified Aggregator**: Merge data by project, time, model
- [ ] **Cost Estimation**: Estimate costs for platforms without token counts
- [ ] **Dashboard**: Visual dashboard with source tabs
- [ ] **Per-Project Breakdown**: Show usage by GitHub project directory

### Enhanced Features (v2)

- [ ] **Trend Analysis**: Compare usage over time
- [ ] **Model Distribution**: Pie chart by model
- [ ] **Cost Prediction**: Forecast monthly spend
- [ ] **Budget Alerts**: Notify when approaching limits
- [ ] **Export Reports**: JSON, CSV, Markdown

## Success Criteria

| Criteria | Metric | Target |
|----------|--------|--------|
| Cursor data captured | Call count match | ≥95% accuracy |
| Claude Code data captured | Session count | ≥90% accuracy |
| Per-project accuracy | Path matching | 100% for GitHub repos |
| Cost estimation | vs actual (if available) | ±20% |
| Dashboard load time | First paint | <2 seconds |

## Out of Scope

- Real-time API interception (proxy-based tracking)
- Modifying platform behavior
- Cloud-based aggregation (all local)
- Payment integration
