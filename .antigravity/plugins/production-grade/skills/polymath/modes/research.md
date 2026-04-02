# Research Mode — Domain and Technical Research

Load this mode when the user needs to understand a domain, market, technology landscape, or any topic requiring current external information.

## Entry Behavior

Before presenting options, do a landscape sweep — 3-5 parallel search_web calls:

```
search_web("[domain] market overview [year]")
search_web("[domain] top platforms comparison")
search_web("[domain] pain points challenges users")
search_web("[domain] technology stack architecture")
search_web("[domain] market size growth trends")
```

Synthesize results into a structured landscape map, THEN present direction options.

## Research Frameworks

### Market/Domain Research
1. **Landscape sweep** — parallel searches for overview, competitors, pain points
2. **Segment identification** — group findings into 3-5 clear categories
3. **Gap analysis** — where are the underserved segments?
4. **Present with options** — which segment to dig into

### Competitive Analysis
1. **Identify players** — search for top platforms/products in the space
2. **Feature comparison** — what each offers, pricing, strengths, weaknesses
3. **Differentiation opportunities** — what's missing or poorly served
4. **Deep dive** — read_url_content on specific competitor pages for detail

### Technology Research
1. **Current state** — search for latest versions, maintenance status, adoption
2. **Comparison** — search for "X vs Y [year]" for competing technologies
3. **Production experience** — search for "[technology] production issues" or "[technology] case study"
4. **Ecosystem** — search for libraries, integrations, community activity

### Cost Research
1. **Cloud pricing** — search for current pricing pages (changes quarterly)
2. **SaaS pricing** — search for competitor pricing models
3. **TCO modeling** — combine cloud costs + operational costs + opportunity costs
4. **Present as comparison table** — with clear "our estimated range"

## Synthesis Template

After every research session, synthesize into this structure:

```markdown
## [Topic] — Research Summary
Date: [YYYY-MM-DD]
Sources: [N] sources consulted

### Key Findings
1. [Most important finding]
2. [Second most important]
3. [Third]

### Landscape
| Segment/Player | Description | Strengths | Weaknesses |
|----------------|-------------|-----------|------------|
| ... | ... | ... | ... |

### Gaps / Opportunities
- [What's missing in the market]
- [What's poorly served]

### Risks / Considerations
- [Important caveats]
- [Conflicting information]

### Confidence Level
- High confidence: [claims well-supported by multiple sources]
- Medium confidence: [claims with limited sources]
- Low confidence: [claims based on single source or inference]
```

## Presenting Research Results

Always present research with direction options — never end with a wall of text:

```python
notify_user with markdown options:
  "question": "[Synthesis of findings — 3-5 key points]",
  "header": "Research: [Topic]",
  "options": [
    {"label": "Dig into [most relevant segment] (Recommended)", "description": "[why this is relevant]"},
    {"label": "Compare [option A] vs [option B]", "description": "Detailed comparison of top candidates"},
    {"label": "Research the technical implementation", "description": "How would we actually build this?"},
    {"label": "I've seen enough — let's move forward", "description": "Proceed with what we know"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

## Output

- Individual research sessions: `research/YYYY-MM-DD-topic.md`
- Accumulated domain knowledge: `context/domain-research.md` (append new findings)
- Flows into `handoff/context-package.md` at handoff time
