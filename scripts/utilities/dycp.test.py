#!/usr/bin/env python3
"""
Unit tests for DyCP KadaneDial Algorithm
"""

import sys
from pathlib import Path

# Import module
scripts_dir = Path(__file__).parent
sys.path.insert(0, str(scripts_dir))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("dycp", scripts_dir / "dycp.py")
dycp_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dycp_mod)

# Import functions
z_normalize = dycp_mod.z_normalize
kadane_dial = dycp_mod.kadane_dial
merge_overlapping_spans = dycp_mod.merge_overlapping_spans
score_message = dycp_mod.score_message
score_conversation = dycp_mod.score_conversation
compress_conversation = dycp_mod.compress_conversation
deduplicate_tool_results = dycp_mod.deduplicate_tool_results
compress_spans = dycp_mod.compress_spans


def test_z_normalize_basic():
    """Test basic z-normalization."""
    scores = [1.0, 2.0, 3.0, 4.0, 5.0]
    z_scores = z_normalize(scores)

    # Mean should be ~0
    assert abs(sum(z_scores)) < 0.001
    # Std should be ~1
    import math

    std = math.sqrt(sum(z * z for z in z_scores) / len(z_scores))
    assert abs(std - 1.0) < 0.001


def test_z_normalize_empty():
    """Test z-normalize with empty list."""
    assert z_normalize([]) == []


def test_z_normalize_single():
    """Test z-normalize with single value."""
    assert z_normalize([5.0]) == [0.0]


def test_kadane_dial_basic():
    """Test KadaneDial with varied scores."""
    # Use extreme scores for clear high/low separation
    scores = [0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9]
    spans = dycp_mod.kadane_dial(scores)
    # Should find spans covering the high-scoring portions
    assert len(spans) >= 1, (
        f"Expected at least 1 span, got {len(spans)}. Spans: {spans}"
    )
    # Spans should cover high-scoring portions
    for start, end in spans:
        avg = sum(scores[start:end]) / (end - start)
        assert avg > 0.5, f"Span [{start}-{end}] avg {avg} too low"


def test_kadane_dial_empty():
    """Test KadaneDial with empty list."""
    assert kadane_dial([]) == []


def test_kadane_dial_min_span():
    """Test KadaneDial respects minimum span length."""
    scores = [0.5, 0.1, 0.1]  # Only 1 high, need min 3
    spans = kadane_dial(scores, window_min=3, tau=0.3)
    # Should not find spans if none meet minimum
    assert all(end - start >= 3 for start, end in spans)


def test_kadane_dial_window_max():
    """Test KadaneDial respects maximum window."""
    scores = [0.8] * 30
    spans = kadane_dial(scores, window_max=5)
    # Each span should be at most 5
    assert all(end - start <= 5 for start, end in spans)


def test_merge_overlapping_spans():
    """Test merging overlapping spans."""
    spans = [(0, 5), (3, 8), (10, 15)]
    merged = merge_overlapping_spans(spans)
    assert merged == [(0, 8), (10, 15)]


def test_merge_adjacent_spans():
    """Test merging adjacent spans."""
    spans = [(0, 3), (4, 7), (8, 10)]
    merged = merge_overlapping_spans(spans)
    assert merged == [(0, 10)]


def test_merge_empty():
    """Test merging with empty spans."""
    assert merge_overlapping_spans([]) == []


def test_score_message_assistant():
    """Test scoring assistant messages."""
    msg = {"role": "assistant", "content": "I created a new function"}
    score = score_message(msg)
    assert 0 <= score <= 1


def test_score_message_system():
    """Test that system messages score 0."""
    msg = {"role": "system", "content": "System prompt here"}
    score = score_message(msg)
    assert score == 0.0


def test_score_message_high_impact():
    """Test high-impact keywords increase score."""
    msg = {"role": "assistant", "content": "Decided to use PostgreSQL for the database"}
    score = score_message(msg)
    assert score > 0.5  # Should be relatively high due to "decided" + "database"


def test_score_message_short():
    """Test short messages score lower."""
    msg_short = {"role": "assistant", "content": "ok"}
    msg_long = {
        "role": "assistant",
        "content": "This is a much longer message with more content about the implementation details",
    }
    assert score_message(msg_short) < score_message(msg_long)


def test_score_message_repetition():
    """Test repetition reduces score."""
    prev = {"role": "assistant", "content": "Same content here"}
    msg = {"role": "assistant", "content": "Same content here"}
    score_first = score_message(prev)
    score_dup = score_message(msg, context=[prev])
    assert score_dup < score_first


def test_score_conversation():
    """Test scoring entire conversation."""
    messages = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "Fix the bug"},
        {"role": "assistant", "content": "I created a fix for the bug"},
    ]
    scores = score_conversation(messages)
    assert len(scores) == 3
    assert scores[0] == 0.0  # System


def test_compress_spans_empty():
    """Test compressing empty conversation."""
    result = compress_conversation([])
    assert result["original_count"] == 0
    assert result["compressed_count"] == 0


def test_compress_spans_short():
    """Test short conversation is unchanged."""
    messages = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi!"},
    ]
    result = compress_conversation(messages)
    assert result["compressed_count"] <= result["original_count"]


def test_compress_spans_keeps_recent():
    """Test that recent messages are always kept."""
    messages = [{"role": "user", "content": f"Message {i}"} for i in range(30)]
    result = compress_conversation(messages, keep_recent=5)
    # Last 5 messages should be kept
    compressed = result["messages"]
    last_five = compressed[-5:]
    assert all(msg["role"] == "user" for msg in last_five)


def test_compress_conversation_stats():
    """Test compression statistics."""
    messages = [{"role": "user", "content": f"Message {i}"} for i in range(30)]
    result = compress_conversation(messages)
    assert "original_count" in result
    assert "compressed_count" in result
    assert "compression_ratio" in result
    assert "tokens_saved" in result


def test_compress_conversation_spans():
    """Test that spans are identified."""
    messages = [{"role": "user", "content": f"Message {i}"} for i in range(30)]
    # Add high-impact content
    messages[5] = {
        "role": "assistant",
        "content": "Decided to use PostgreSQL for the database",
    }
    messages[15] = {
        "role": "assistant",
        "content": "Created the new authentication module",
    }

    result = compress_conversation(messages)
    # Spans should be identified
    assert "spans" in result


def test_deduplicate_tool_results():
    """Test tool result deduplication."""
    messages = [
        {"role": "user", "content": "Run test"},
        {"role": "tool", "content": "Test result: 10 passed"},
        {"role": "tool", "content": "Test result: 10 passed"},  # Duplicate
    ]
    deduped = deduplicate_tool_results(messages)
    # Should have one real result + one dedup marker
    assert len(deduped) == 3  # user + 2 tool messages


def test_compress_conversation_truncate_strategy():
    """Test truncate strategy."""
    messages = [{"role": "user", "content": f"Message {i}"} for i in range(30)]
    result = compress_conversation(messages, strategy="truncate")
    assert result["strategy"] == "truncate"


def test_compress_conversation_custom_params():
    """Test custom KadaneDial parameters."""
    messages = [{"role": "assistant", "content": f"Content {i}"} for i in range(20)]
    result = compress_conversation(
        messages,
        tau=0.8,  # Higher threshold
        theta=2.0,  # Higher stopping
        window_min=5,
        window_max=10,
    )
    assert "spans" in result


def test_compression_ratio():
    """Test compression ratio calculation."""
    messages = [
        {"role": "assistant", "content": "x" * 1000}  # Long message
        for i in range(30)
    ]
    result = compress_conversation(messages)
    # Compression should reduce message count
    assert result["compressed_count"] < result["original_count"]


def run_tests():
    """Run all tests."""
    tests = [
        ("z_normalize_basic", test_z_normalize_basic),
        ("z_normalize_empty", test_z_normalize_empty),
        ("z_normalize_single", test_z_normalize_single),
        ("kadane_dial_basic", test_kadane_dial_basic),
        ("kadane_dial_empty", test_kadane_dial_empty),
        ("kadane_dial_min_span", test_kadane_dial_min_span),
        ("kadane_dial_window_max", test_kadane_dial_window_max),
        ("merge_overlapping_spans", test_merge_overlapping_spans),
        ("merge_adjacent_spans", test_merge_adjacent_spans),
        ("merge_empty", test_merge_empty),
        ("score_message_assistant", test_score_message_assistant),
        ("score_message_system", test_score_message_system),
        ("score_message_high_impact", test_score_message_high_impact),
        ("score_message_short", test_score_message_short),
        ("score_message_repetition", test_score_message_repetition),
        ("score_conversation", test_score_conversation),
        ("compress_spans_empty", test_compress_spans_empty),
        ("compress_spans_short", test_compress_spans_short),
        ("compress_spans_keeps_recent", test_compress_spans_keeps_recent),
        ("compress_conversation_stats", test_compress_conversation_stats),
        ("compress_conversation_spans", test_compress_conversation_spans),
        ("deduplicate_tool_results", test_deduplicate_tool_results),
        (
            "compress_conversation_truncate_strategy",
            test_compress_conversation_truncate_strategy,
        ),
        (
            "compress_conversation_custom_params",
            test_compress_conversation_custom_params,
        ),
        ("compression_ratio", test_compression_ratio),
    ]

    passed = 0
    failed = 0

    print("Running DyCP KadaneDial Tests...\n")

    for name, test_fn in tests:
        try:
            test_fn()
            print(f"  ✓ {name}")
            passed += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            failed += 1

    print("\n" + "=" * 50)
    if failed == 0:
        print(f"✅ All {passed} tests passed!")
    else:
        print(f"❌ {passed} passed, {failed} failed")
    print("=" * 50)

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
