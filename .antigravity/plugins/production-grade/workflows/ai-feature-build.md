---
description: Build an AI-powered feature (RAG, chatbot, agent) using AI Build mode with prompt engineering and evaluation
---

# AI Feature Build Workflow

Use this workflow when adding AI/LLM-powered features to an existing or new application.

## Prerequisites
- Clear description of what the AI feature should do
- Target model provider (OpenAI, Anthropic, Google, local) or permission to recommend
- For RAG: documents/data sources to index

## Steps

1. **Initialize in AI Build mode**
   ```
   Use production-grade skill in AI Build mode
   ```

2. **Codebase Scan**
   - Identify existing AI infrastructure (API clients, embedding models, vector stores)
   - Check for existing prompt patterns, model configurations
   - Map current data flow for AI-relevant data

3. **PM Scoping (Express)**
   - 3-5 questions to scope the AI feature
   - Define: what AI does, what user sees, quality expectations, cost tolerance
   - Output: AI-focused user stories with AI quality acceptance criteria

4. **Data Scientist: Architecture Design**
   - Task classification (generation, extraction, RAG, agent, classification)
   - Model selection with cost/quality/latency analysis
   - RAG pipeline design (if applicable): chunking → embedding → retrieval → reranking
   - Agent architecture (if applicable): tool use, memory, safety
   - **Gate: Approve AI architecture before prompt design**

5. **Prompt Engineer: Prompt Design**
   - System prompt + user template + few-shot examples
   - Evaluation dataset (50+ test cases: happy path, edge cases, adversarial)
   - Run eval suite, report baseline metrics
   - Optimize: latency, cost, quality balance
   - **Gate: Approve prompt quality before implementation**

6. **Architect: API Design (scoped)**
   - API contracts for AI endpoints (streaming, non-streaming)
   - Vector DB schema (if RAG)
   - Rate limiting and cost controls

7. **Build Phase (Parallel)**
   - Software Engineer: AI service layer, LLM client, RAG pipeline, vector DB integration
   - Frontend Engineer: AI chat UI, streaming response display, loading states

8. **Test + Evaluate**
   - QA: Unit + integration tests for AI endpoints
   - Data Scientist: Run full evaluation suite on deployed feature
   - Verify: quality meets bar, cost within budget, latency acceptable

## Recommended Config

```yaml
# .production-grade.yaml
engagement_mode: standard
overrides:
  data_scientist:
    system_classification: ai_first
    phases: [1, 2, 7, 8, 9, 10, 3, 6]
  prompt_engineer:
    eval_min_cases: 50
    quality_bar: 4.0
```

## RAG Feature Specifics

If the AI feature is RAG-based (knowledge base, search, Q&A):

1. **Document ingestion pipeline** (Data Scientist Phase 8)
2. **Vector store setup** (Data Scientist Phase 9)
3. **Retrieval + reranking** (Data Scientist Phase 8)
4. **Evaluation metrics** — Recall@10 > 0.9, MRR > 0.7

## Agent Feature Specifics

If the AI feature uses tool-calling agents:

1. **Tool definitions** (Prompt Engineer)
2. **Agent loop design** — ReAct, Planning, or Supervisor pattern (Data Scientist Phase 10)
3. **Safety guardrails** — max iterations, tool permissions, human-in-the-loop
4. **Memory management** — short-term (conversation), long-term (vector store)
