---
description: Deep research workflow using web search + NotebookLM MCP for grounded, citation-backed analysis
---

# Deep Research Workflow

Use this workflow when you need thorough, grounded research on any topic — technology evaluation, competitive analysis, domain exploration, architecture research, etc.

**Key advantage:** NotebookLM provides Gemini-grounded, zero-hallucination answers with citations from your collected sources. Results are significantly richer than web search alone.

## Prerequisites
- NotebookLM MCP tools available (check for `mcp_notebooklm_*` or `mcp__notebooklm-mcp__*`)
- Authenticated session (`nlm login` or `mcp_notebooklm_refresh_auth`)
- If MCP unavailable → workflow degrades gracefully to web search only

## Steps

### Phase 1: Web Discovery (Always Available)

1. **Define research questions** — clarify what you need to learn
2. **Broad web search** — 3-5 parallel search_web calls covering different angles:
   ```
   search_web("[topic] overview comparison 2026")
   search_web("[topic] best practices patterns")
   search_web("[topic] challenges limitations risks")
   search_web("[topic] real-world case studies")
   ```
3. **Collect URLs** — save 5-15 most relevant URLs from search results
4. **Quick read** — use `read_url_content` on top 3-5 URLs for initial understanding

> **If NotebookLM MCP is NOT available:** Stop here. Synthesize findings from web search into a report. This is still valuable research, just without the grounding layer.

### Phase 2: NotebookLM Deep Research (Enhanced, Optional)

5. **Session check** — verify authentication:
   ```python
   server_info()  # If fails, run nlm login and refresh_auth
   ```
6. **Create research notebook:**
   ```python
   notebook_create(title="Research: [Topic] — [Date]")
   ```
7. **Add sources from Phase 1:**
   ```python
   # Add each URL collected in Phase 1 (wait 2s between each)
   source_add(notebook_id=nb_id, source_type="url", url="https://...")
   ```
8. **Run deep research** for additional sources:
   ```python
   research_start(query="[topic]", notebook_id=nb_id, mode="deep")
   research_status(notebook_id=nb_id, max_wait=300)  # Wait up to 5 min
   research_import(notebook_id=nb_id, task_id=task_id)  # Import all
   ```
9. **Iterative querying** — build understanding through follow-ups:
   ```python
   # Round 1: Broad overview
   r1 = notebook_query(nb_id, "Comprehensive overview of [topic]")

   # Round 2: Deep specifics
   r2 = notebook_query(nb_id, "Implementation challenges and trade-offs?",
                        conversation_id=r1["conversation_id"])

   # Round 3: Gaps and risks
   r3 = notebook_query(nb_id, "What's missing? Edge cases? Risks?",
                        conversation_id=r1["conversation_id"])

   # Round 4: Actionable synthesis
   r4 = notebook_query(nb_id, "Key decisions and recommendations?",
                        conversation_id=r1["conversation_id"])
   ```

### Phase 3: Synthesize & Output

10. **Generate structured output** (choose based on need):
    ```python
    # Briefing document
    studio_create(nb_id, artifact_type="report",
                  report_format="Briefing Doc", confirm=True)

    # Mind map for visual overview
    studio_create(nb_id, artifact_type="mind_map",
                  title="[Topic] Overview", confirm=True)

    # Study guide for deep learning
    studio_create(nb_id, artifact_type="report",
                  report_format="Study Guide", confirm=True)
    ```
11. **Download artifacts:**
    ```python
    download_artifact(nb_id, artifact_type="report", output_path="research-report.md")
    ```
12. **Write synthesis** — combine web search findings + NotebookLM grounded answers into a final research report with:
    - Key findings (with citations)
    - Trade-off analysis
    - Risk assessment
    - Actionable recommendations

## Guard Rails

- **Dedicated account:** Use a separate Google account for NotebookLM automation
- **Rate limiting:** Wait 2s between source operations, 5s between content generation
- **Session timeout:** Re-authenticate if commands fail (sessions expire ~20 min)
- **Fallback always:** If NotebookLM is unavailable, Phase 1 alone provides solid research
- **Free tier limit:** ~50 queries/day — plan queries efficiently

## Integration with Forgewright Skills

| Skill | How Research Helps |
|-------|--------------------|
| **Polymath** | Pre-flight research grounded in real sources, not training data |
| **Product Manager** | Market research with citations for BRD |
| **Solution Architect** | Technology evaluation with real-world evidence |
| **Data Scientist** | Model/framework comparison with benchmarks |
| **Security Engineer** | Threat intelligence with current vulnerability data |
