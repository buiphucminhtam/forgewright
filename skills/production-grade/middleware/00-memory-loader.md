# Middleware 00 — Optional Memory Context

**Hook:** `before_skill`, only when prior context materially helps.

Current workspace/runtime evidence and current user instructions remain authoritative. Memory is optional, untrusted context. Respect `MEM0_DISABLED` and `FORGEWRIGHT_SKIP_MEM0`; ordinary work continues when memory is unavailable.

1. Select a relevant query or explicit scoped handoff; do not retrieve on every request.
2. Use `python3 scripts/lite/context-manager.py load --keywords "<query>" --char-cap 2000` or the canonical memory `context` command.
3. Inject only the returned bounded packet, including its citations and context-only wrapper. Diagnostics belong on stderr. The default is a character estimate, not a measured model-token count.
4. Re-ground cited claims against current files. Empty, disabled, stale-source and degraded retrieval are distinct outcomes; never invent recovered context or substitute unrelated persona/scenario text.
5. Verify the actual host consumed the packet before claiming automatic injection. Explicit CLI output alone does not prove a native hook is activated.

For capture, namespace, migration, privacy and host limitations, follow [memory-manager](../../memory-manager/SKILL.md). Selected structured summaries are supported; full transcript ingestion, paid embeddings and automatic lesson/skill promotion are outside this flow.
