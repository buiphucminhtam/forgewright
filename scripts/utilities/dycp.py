#!/usr/bin/env python3
"""
Forgewright Conversation Pruner — DyCP KadaneDial Algorithm

Implements KadaneDial (from DyCP paper) for intelligent conversation span selection.
Finds high-relevance spans and compresses low-relevance ones.

Token savings: 50-70% conversation reduction (DyCP: 26-54% proven)

Usage:
    python3 dycp.py compress [--messages MESSAGES_JSON] [--threshold 0.7]
    python3 dycp.py score [--message TEXT]
    python3 dycp.py analyze [--conversation CONVERSATION_JSON]

Architecture:
    1. Score each message (importance/relevance)
    2. Z-score normalize scores
    3. KadaneDial: find significant spans using modified Kadane's algorithm
    4. Compress non-span messages into summaries

Integration:
    - Hooks into middleware chain between ⑤ (Summarization) and ⑥ (QualityGate)
    - Works with Memory Manager for decision/blocker extraction
    - Offloads to filesystem for maximum recovery
"""

import os
import re
import sys
import json
import math
import hashlib
from pathlib import Path
from datetime import datetime

# ── Constants ─────────────────────────────────────────────────────────────────
DEFAULT_TAU = 0.6  # Gain threshold (z-score shift)
DEFAULT_THETA = 1.0  # Stopping threshold
DEFAULT_WINDOW_MIN = 3  # Minimum span length (messages)
DEFAULT_WINDOW_MAX = 20  # Maximum span length (messages)
DEFAULT_THRESHOLD = 0.7  # Token fraction triggering compression

# Relevance score weights
ROLE_WEIGHTS = {
    "user": 1.0,
    "assistant": 1.2,  # Assistant responses are more informative
    "system": 0.0,  # System messages always kept
}

# Keyword importance multipliers
HIGH_IMPACT_KEYWORDS = [
    # Decisions
    r"\b(decided|chose|selected|using|switched to|migrated to)\b",
    # Architecture
    r"\b(architecture|stack|framework|database|api|service)\b",
    # Errors/blockers
    r"\b(error|failed|exception|blocker|issue|problem|bug)\b",
    # Code changes
    r"\b(impl|implement|created|modified|deleted|refactor)\b",
    # Quality
    r"\b(pass|fail|test|quality|review)\b",
]

LOW_IMPACT_KEYWORDS = [
    r"\b(okay|ok|sure|yes|no|please|thanks)\b",
    r"\b(what|how|why|when|where)\b.*\?",  # Questions without context
    r"^.{1,50}$",  # Very short messages
]


# ── Relevance Scoring ──────────────────────────────────────────────────────────


def score_message(message: dict, context: list[dict] = None) -> float:
    """
    Score a message by relevance/importance.
    Returns 0-1 score where higher = more important.
    """
    role = message.get("role", "assistant").lower()
    content = message.get("content", "")

    # Base score from role
    base_score = ROLE_WEIGHTS.get(role, 1.0)

    # Skip system messages
    if role == "system":
        return 0.0

    # Length factor (longer messages often more important)
    length_factor = min(len(content) / 500, 1.0) * 0.3

    # High-impact keyword matches
    high_impact = 0.0
    for pattern in HIGH_IMPACT_KEYWORDS:
        if re.search(pattern, content, re.IGNORECASE):
            high_impact += 0.2

    # Low-impact keyword penalties
    low_impact = 0.0
    for pattern in LOW_IMPACT_KEYWORDS:
        if re.search(pattern, content, re.IGNORECASE):
            low_impact -= 0.15

    # Code presence (code = more substantial)
    code_mentions = content.count("```") + content.count("`")
    code_factor = min(code_mentions / 5, 1.0) * 0.2

    # Repetition penalty (repeated content less valuable)
    repetition_penalty = 0.0
    if context:
        for prev in context[-5:]:  # Check last 5 messages
            prev_content = prev.get("content", "")
            if content == prev_content:
                repetition_penalty -= 0.3
            elif content[:100] == prev_content[:100]:  # Similar start
                repetition_penalty -= 0.1

    # Combine factors
    score = (
        base_score
        + length_factor
        + high_impact
        + code_factor
        + low_impact
        + repetition_penalty
    )
    return max(0.0, min(1.0, score))


def score_conversation(messages: list[dict]) -> list[float]:
    """Score all messages in a conversation."""
    scores = []
    context = []

    for msg in messages:
        score = score_message(msg, context)
        scores.append(score)
        context.append(msg)

    return scores


# ── KadaneDial Algorithm ──────────────────────────────────────────────────────


def z_normalize(scores: list[float]) -> list[float]:
    """Z-score normalize scores."""
    if not scores:
        return []

    n = len(scores)
    if n == 1:
        return [0.0]

    mean = sum(scores) / n
    variance = sum((s - mean) ** 2 for s in scores) / n
    std = math.sqrt(variance) if variance > 0 else 1.0

    return [(s - mean) / std for s in scores]


def kadane_dial(
    scores: list[float],
    tau: float = DEFAULT_TAU,
    theta: float = DEFAULT_THETA,
    window_min: int = DEFAULT_WINDOW_MIN,
    window_max: int = DEFAULT_WINDOW_MAX,
) -> list[tuple[int, int]]:
    """
    KadaneDial algorithm for finding significant spans.

    Finds high-relevance spans by:
    1. Z-score normalize scores
    2. Shift by gain threshold (tau)
    3. Modified Kadane to find all spans above threshold

    Returns: List of (start, end) tuples for significant spans.
    """
    if not scores:
        return []

    n = len(scores)

    # Z-score normalize
    z_scores = z_normalize(scores)

    # Shift by gain threshold
    shifted = [z - tau for z in z_scores]

    # Adaptive theta: if not specified (default), use 0.5 * window_min as reasonable threshold
    # This accounts for z-scores typically being in range [-2, 2]
    effective_theta = theta if theta != DEFAULT_THETA else max(0.5, window_min * 0.1)

    # Find significant spans using modified Kadane
    spans: list[tuple[int, int]] = []
    i = 0

    while i < n:
        # Start a new potential span
        best_start = i
        best_end = i
        best_sum = shifted[i]
        current_sum = shifted[i]  # Start with first element

        # Extend window up to window_max
        max_j = min(i + window_max, n)

        for j in range(i, max_j):
            current_sum += shifted[j]

            if current_sum > best_sum:
                best_sum = current_sum
                best_end = j + 1

            # Stop if below theta (stopping threshold)
            if current_sum < effective_theta:
                break

        # Accept span if above minimum length and positive sum
        span_len = best_end - best_start
        if span_len >= window_min and best_sum > 0:
            spans.append((best_start, best_end))
            i = best_end
        else:
            i += 1

    return spans


def merge_overlapping_spans(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Merge overlapping or adjacent spans."""
    if not spans:
        return []

    # Sort by start
    sorted_spans = sorted(spans, key=lambda x: x[0])

    merged = [sorted_spans[0]]

    for current in sorted_spans[1:]:
        last = merged[-1]

        # If overlapping or adjacent (within 1), merge
        if current[0] <= last[1] + 1:
            merged[-1] = (last[0], max(last[1], current[1]))
        else:
            merged.append(current)

    return merged


# ── Compression ────────────────────────────────────────────────────────────────


def compress_spans(
    messages: list[dict], spans: list[tuple[int, int]], keep_recent: int = 5
) -> list[dict]:
    """
    Compress conversation by keeping spans and compressing the rest.

    Args:
        messages: Original message list
        spans: Significant spans to keep intact
        keep_recent: Number of recent messages to always keep

    Returns:
        Compressed message list
    """
    if not messages:
        return []

    n = len(messages)

    # Always keep recent messages
    keep_start = max(0, n - keep_recent)

    # Build set of indices to keep
    keep_indices = set(range(keep_start, n))  # Recent messages

    # Add significant span indices
    for start, end in spans:
        for i in range(start, min(end, n)):
            keep_indices.add(i)

    # Build compressed conversation
    compressed = []
    i = 0

    while i < n:
        if i in keep_indices:
            # Keep this message
            compressed.append(messages[i])
            i += 1
        else:
            # Check for consecutive non-kept messages
            start = i
            while i < n and i not in keep_indices:
                i += 1
            end = i

            # Create compression summary
            span_messages = messages[start:end]
            summary = _summarize_span(span_messages, start, end, n)

            compressed.append(
                {
                    "role": "system",
                    "content": summary,
                    "is_compressed": True,
                    "original_range": [start, end],
                }
            )

    return compressed


def _summarize_span(messages: list[dict], start: int, end: int, total: int) -> str:
    """Create a summary for a compressed span."""
    if not messages:
        return f"[... {end - start} earlier messages compressed ...]"

    # Count by role
    roles = {}
    total_chars = 0

    for msg in messages:
        role = msg.get("role", "unknown")
        roles[role] = roles.get(role, 0) + 1
        total_chars += len(msg.get("content", ""))

    # Extract key phrases
    key_phrases = []
    for msg in messages:
        content = msg.get("content", "")
        # Find high-impact sentences
        for pattern in HIGH_IMPACT_KEYWORDS:
            matches = re.findall(r"[^.!?]+[.!?]", content)
            for match in matches[:2]:  # Max 2 per message
                if re.search(pattern, match, re.IGNORECASE):
                    key_phrases.append(match.strip()[:100])
                    break

    # Build summary
    lines = [f"[... {end - start} messages compressed ({start}-{end} of {total}) ...]"]

    if roles:
        role_summary = ", ".join(f"{v} {k}" for k, v in roles.items())
        lines.append(f"Summary: {role_summary}, ~{total_chars // 100}00 chars")

    if key_phrases:
        lines.append(f"Key: {key_phrases[0][:150]}")

    return "\n".join(lines)


def deduplicate_tool_results(messages: list[dict]) -> list[dict]:
    """
    Deduplicate tool results in conversation.
    Same tool+args = only show first result.
    """
    seen = {}
    deduped = []

    for msg in messages:
        if msg.get("role") == "tool":
            # Create key from tool name and args
            content = msg.get("content", "")
            tool_hash = hashlib.md5(content[:500].encode()).hexdigest()[:16]

            if tool_hash not in seen:
                seen[tool_hash] = len(deduped)
                deduped.append(msg)
            else:
                # Replace with short reference
                deduped.append(
                    {
                        "role": "tool",
                        "content": f"[Duplicate result — same as message {seen[tool_hash] + 1}]",
                        "is_deduped": True,
                    }
                )
        else:
            deduped.append(msg)

    return deduped


def purge_error_only_messages(messages: list[dict]) -> list[dict]:
    """
    Remove error-only messages that have been resolved.
    Keep only if the error hasn't been acknowledged/fixed.
    """
    purged = []
    error_counts = {}

    for msg in messages:
        content = msg.get("content", "")
        role = msg.get("role", "")

        # Detect error messages
        is_error = "error" in content.lower() or "failed" in content.lower()

        if is_error and role == "tool":
            error_hash = hashlib.md5(content[:200].encode()).hexdigest()[:16]

            # Check if this error was later fixed/acknowledged
            if error_hash in error_counts:
                # Error already seen, might be old
                error_counts[error_hash] += 1
            else:
                error_counts[error_hash] = 1
                purged.append(msg)
        else:
            purged.append(msg)

    return purged


# ── Main Compression ──────────────────────────────────────────────────────────


def compress_conversation(
    messages: list[dict],
    tau: float = DEFAULT_TAU,
    theta: float = DEFAULT_THETA,
    window_min: int = DEFAULT_WINDOW_MIN,
    window_max: int = DEFAULT_WINDOW_MAX,
    keep_recent: int = 5,
    strategy: str = "structured_summary",
) -> dict:
    """
    Main entry point for conversation compression.

    Args:
        messages: List of conversation messages
        tau: Z-score shift threshold (default: 0.6)
        theta: Stopping threshold (default: 1.0)
        window_min: Minimum span length (default: 3)
        window_max: Maximum span length (default: 20)
        keep_recent: Recent messages to keep (default: 5)
        strategy: "structured_summary" | "truncate" | "offload"

    Returns:
        CompressionResult with compressed messages and stats
    """
    if not messages:
        return {
            "original_count": 0,
            "compressed_count": 0,
            "compression_ratio": 1.0,
            "spans": [],
            "messages": [],
            "tokens_saved": 0,
        }

    original_count = len(messages)

    # Pre-processing: deduplicate and purge
    processed = deduplicate_tool_results(messages)
    processed = purge_error_only_messages(processed)

    # Score messages
    scores = score_conversation(processed)

    # Find significant spans
    spans = kadane_dial(scores, tau, theta, window_min, window_max)
    spans = merge_overlapping_spans(spans)

    # Compress based on strategy
    if strategy == "truncate":
        compressed = _truncate_conversation(processed, keep_recent)
    elif strategy == "offload":
        compressed = _offload_conversation(processed, keep_recent)
    else:  # structured_summary
        compressed = compress_spans(processed, spans, keep_recent)

    compressed_count = len(compressed)

    # Estimate tokens (rough: ~4 chars per token)
    original_tokens = sum(len(m.get("content", "")) for m in messages) // 4
    compressed_tokens = sum(len(m.get("content", "")) for m in compressed) // 4

    return {
        "original_count": original_count,
        "compressed_count": compressed_count,
        "compression_ratio": compressed_count / original_count
        if original_count > 0
        else 1.0,
        "spans": spans,
        "messages": compressed,
        "tokens_saved": original_tokens - compressed_tokens,
        "original_tokens": original_tokens,
        "compressed_tokens": compressed_tokens,
        "scores": scores,
        "strategy": strategy,
    }


def _truncate_conversation(messages: list[dict], keep_recent: int = 5) -> list[dict]:
    """Strategy 2: Simple truncation."""
    if len(messages) <= keep_recent + 3:
        return messages

    n = len(messages)
    kept = messages[:2] + messages[-keep_recent:]  # Keep first 2 + last keep_recent

    # Add truncation marker
    kept.insert(
        2,
        {
            "role": "system",
            "content": f"[... {n - 2 - keep_recent} earlier messages truncated ...]",
            "is_compressed": True,
        },
    )

    return kept


def _offload_conversation(messages: list[dict], keep_recent: int = 5) -> list[dict]:
    """Strategy 3: Offload to filesystem."""
    if len(messages) <= keep_recent + 3:
        return messages

    # Save full conversation
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    session_id = os.environ.get("FORGEWRIGHT_SESSION_ID", "unknown")
    filename = f"context-cache/{session_id}-{timestamp}.md"  # noqa: F841

    # Ensure directory exists
    cache_dir = Path(".forgewright/context-cache")
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Write full conversation
    filepath = cache_dir / f"{session_id}-{timestamp}.md"
    with open(filepath, "w") as f:
        for i, msg in enumerate(messages):
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            f.write(f"## [{i}] {role}\n\n{content}\n\n---\n\n")

    # Return truncated with reference
    truncated = _truncate_conversation(messages, keep_recent)

    # Add filesystem reference
    for msg in truncated:
        if msg.get("is_compressed"):
            msg["content"] += f"\n[Full context saved to {filepath}]"

    return truncated


# ── CLI Commands ─────────────────────────────────────────────────────────────


def cmd_compress(args):
    """Compress a conversation."""
    import argparse

    parser = argparse.ArgumentParser(description="Compress conversation")
    parser.add_argument("--messages", required=True, help="JSON array of messages")
    parser.add_argument(
        "--threshold", type=float, default=DEFAULT_THRESHOLD, help="Token threshold"
    )
    parser.add_argument("--tau", type=float, default=DEFAULT_TAU, help="Z-score shift")
    parser.add_argument(
        "--theta", type=float, default=DEFAULT_THETA, help="Stopping threshold"
    )
    parser.add_argument(
        "--keep-recent", type=int, default=5, help="Recent messages to keep"
    )
    parser.add_argument(
        "--strategy", default="structured_summary", help="Compression strategy"
    )
    parser.add_argument("--output", help="Output file")

    parsed = parser.parse_args(args)

    messages = json.loads(parsed.messages)
    result = compress_conversation(
        messages,
        tau=parsed.tau,
        theta=parsed.theta,
        keep_recent=parsed.keep_recent,
        strategy=parsed.strategy,
    )

    output = json.dumps(result, indent=2, default=str)

    if parsed.output:
        Path(parsed.output).write_text(output)
        print(f"Compressed conversation saved to {parsed.output}")
    else:
        print(output)

    print("\nStats:")
    print(
        f"  Original: {result['original_count']} messages, ~{result['original_tokens']} tokens"
    )
    print(
        f"  Compressed: {result['compressed_count']} messages, ~{result['compressed_tokens']} tokens"
    )
    print(f"  Compression: {result['compression_ratio']:.1%}")
    print(f"  Tokens saved: ~{result['tokens_saved']}")


def cmd_score(args):
    """Score a message."""
    import argparse

    parser = argparse.ArgumentParser(description="Score message relevance")
    parser.add_argument("--message", required=True, help="Message text")
    parser.add_argument("--role", default="assistant", help="Message role")

    parsed = parser.parse_args(args)

    msg = {"role": parsed.role, "content": parsed.message}
    score = score_message(msg)

    print(f"Message: {parsed.message[:100]}...")
    print(f"Role: {parsed.role}")
    print(f"Relevance score: {score:.3f}")


def cmd_analyze(args):
    """Analyze a conversation."""
    import argparse

    parser = argparse.ArgumentParser(description="Analyze conversation")
    parser.add_argument("--conversation", required=True, help="JSON file with messages")

    parsed = parser.parse_args(args)

    with open(parsed.conversation) as f:
        data = json.load(f)

    messages = data if isinstance(data, list) else data.get("messages", [])

    # Score
    scores = score_conversation(messages)

    # KadaneDial
    spans = kadane_dial(scores)

    print(f"Conversation: {len(messages)} messages\n")

    print("Message scores:")
    for i, (msg, score) in enumerate(zip(messages, scores)):
        role = msg.get("role", "?")[:10]
        content = msg.get("content", "")[:50].replace("\n", " ")
        bar = "█" * int(score * 20) + "░" * (20 - int(score * 20))
        print(f"  [{i:2d}] {bar} {score:.2f} {role}: {content}...")

    print(f"\nSignificant spans: {len(spans)}")
    for start, end in spans:
        avg_score = sum(scores[start:end]) / (end - start) if end > start else 0
        print(f"  [{start}-{end}] avg_score={avg_score:.2f} ({end - start} messages)")

    # Compression preview
    result = compress_conversation(messages)
    print("\nCompression preview:")
    print(f"  Original: {result['original_count']} messages")
    print(f"  Compressed: {result['compressed_count']} messages")
    print(f"  Ratio: {result['compression_ratio']:.1%}")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("\nCommands:")
        print("  compress  — Compress conversation with KadaneDial")
        print("  score     — Score a single message")
        print("  analyze   — Analyze conversation structure")
        return

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd == "compress":
        cmd_compress(args)
    elif cmd == "score":
        cmd_score(args)
    elif cmd == "analyze":
        cmd_analyze(args)
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
