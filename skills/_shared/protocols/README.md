# Forgewright Shared Protocols

> **Purpose:** Single source of truth for core Forgewright concepts shared across all platforms.

## Files in this Directory

The list of all protocols, their triggers, consumers, and lifecycle states has been migrated to a generated catalog.

👉 **[View the Protocol Catalog](../../../docs/reference/protocol-catalog.md)**

### Source of Truth Rules

- **Do not manually maintain protocol lists.** The protocol catalog is generated automatically from the YAML frontmatter of the markdown files in this directory.
- To add a new protocol, create a `.md` file here with valid YAML frontmatter conforming to `schemas/protocol.schema.json`.
- Run `node scripts/catalog/generate-protocol-catalog.mjs` to regenerate the catalog.
- If deprecating a protocol, set `status: deprecated` and optionally `superseded_by: [id]`. Do not just delete the file if it was widely referenced.

---

## Source Attribution

When updating shared content, update the file in this directory AND add a source attribution comment:

```markdown
<!-- source: skills/_shared/protocols/[filename].md -->
```

Example in AGENTS.md:
```markdown
<!-- source: skills/_shared/protocols/evidence-first.md -->
```

---

## Sync Rules

1. **Evidence-First Thinking** — Keep in sync with both AGENTS.md and CLAUDE.md
2. **Pipeline** — Primary source: AGENTS.md, derived in CLAUDE.md
3. **Plan Quality Loop** — Single source in protocols, reference from both
4. **Self-Check** — Single source in protocols

---

*Last Updated: 2026-05-29*
*Part of: Phase 1 - Task 1.2*
