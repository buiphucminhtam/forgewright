# Anti-Hallucination Skill

Systematic framework for preventing, detecting, and mitigating hallucinations in AI agent workflows.

## Overview

This skill transforms 2025-2026 research into actionable practices for production AI systems.

## Quick Start

### Basic Usage

```markdown
When asked about preventing AI hallucinations:

1. Identify the domain (research, code, legal, clinical)
2. Apply appropriate layers of defense
3. Use verification before final output
```

### Decision Tree

```
Is factual accuracy critical?
├─ NO → Focus on CoT for logic
└─ YES → High-stakes?
         ├─ NO → RAG + citations + calibration
         └─ YES → GraphRAG + multi-agent + TokenShapley
```

## Key Techniques

| Technique | Use Case | Complexity |
|-----------|----------|-------------|
| Semantic Energy | Detection | Medium |
| SinkTrack | Long context | Medium |
| TokenShapley | Attribution | High |
| MA-RAG | Complex reasoning | High |
| Multi-agent verification | Critical domains | Medium |

## Modules

1. **Understanding Hallucination** - Root causes and mechanisms
2. **Detection Techniques** - Uncertainty quantification
3. **Prevention Techniques** - RAG, citations, calibration
4. **Architecture Interventions** - Attention modification
5. **Production Implementation** - Layered defense system
6. **Anti-Patterns** - Common mistakes to avoid

## Research Sources

Based on 161 verified sources including:
- 68 arXiv papers
- OpenReview papers 2025-2026
- 93 industry reports
- Vectara Hallucination Leaderboard

## Files

- `anti-hallucination.md` - Full skill documentation
- `anti-hallucination.json` - Skill manifest

---

*Version 1.0.0 | April 2026*
