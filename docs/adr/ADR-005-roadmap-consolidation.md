# ADR-005: Roadmap Consolidation

**Status:** Accepted

**Date:** 2026-07-09

## Context

Multiple roadmap documents described overlapping or conflicting priorities, making it unclear which plan governed current work.

## Decision

Archive historical roadmaps under `docs/archive/` and use `docs/active-roadmap.md` as the single source of truth for current roadmap scope and status.

## Consequences

- Contributors have one canonical roadmap to consult and update.
- Historical plans remain available for context without competing with active scope.
- Changes to roadmap status must update `docs/active-roadmap.md`; archived roadmaps are not active commitments.
