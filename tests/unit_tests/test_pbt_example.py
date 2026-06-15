"""
Property-Based Testing Example using Hypothesis (Python).

Tests property invariants on TokenAnalyzer cost calculations.
"""

import pytest
import importlib.util
from pathlib import Path
from hypothesis import given, strategies as st, settings

# Load token-analyzer.py dynamically
_test_file = Path(__file__).resolve()
_project_root = _test_file.parent.parent.parent
_scripts = _project_root / "scripts"

_spec = importlib.util.spec_from_file_location(
    "token_analyzer",
    _scripts / "token-analyzer.py"
)
_token_analyzer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_token_analyzer)

TokenAnalyzer = _token_analyzer.TokenAnalyzer
UsageRecord = _token_analyzer.UsageRecord


class TestPropertyBasedTokenAnalyzer:
    """Property-based tests for TokenAnalyzer cost calculation."""

    @given(
        provider=st.sampled_from(["anthropic", "openai", "google", "unknown_provider"]),
        model=st.text(min_size=1),
        input_tokens=st.integers(min_value=0, max_value=1_000_000_000),
        output_tokens=st.integers(min_value=0, max_value=1_000_000_000),
    )
    def test_cost_always_non_negative_and_no_crash(self, provider, model, input_tokens, output_tokens):
        """Tính chất 1: Chi phí tính toán luôn không âm và hàm không bao giờ crash với mọi bộ tokens đầu vào."""
        analyzer = TokenAnalyzer()
        record = UsageRecord(
            timestamp="2026-06-15T10:00:00",
            session_id="test_session",
            project="test_project",
            project_path="/tmp/test",
            model=model,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=100
        )
        
        cost = analyzer.calculate_cost(record)
        assert isinstance(cost, float)
        assert cost >= 0.0

    @given(
        provider=st.sampled_from(["anthropic", "openai", "google"]),
        model=st.sampled_from(["claude-3-5-sonnet", "gpt-4o", "gemini-2.5-pro"])
    )
    def test_zero_tokens_is_zero_cost(self, provider, model):
        """Tính chất 2: Không tiêu thụ token thì chi phí luôn bằng 0.0."""
        analyzer = TokenAnalyzer()
        record = UsageRecord(
            timestamp="2026-06-15T10:00:00",
            session_id="test_session",
            project="test_project",
            project_path="/tmp/test",
            model=model,
            provider=provider,
            input_tokens=0,
            output_tokens=0,
            latency_ms=100
        )
        cost = analyzer.calculate_cost(record)
        assert cost == 0.0

    @given(
        input_tokens=st.integers(min_value=0, max_value=50_000_000),
        output_tokens=st.integers(min_value=0, max_value=50_000_000),
    )
    @settings(max_examples=100)
    def test_cost_linearity(self, input_tokens, output_tokens):
        """Tính chất 3: Chi phí tăng tuyến tính tương ứng với số lượng tokens tiêu thụ (không phụ thuộc vào giá trị cụ thể)."""
        analyzer = TokenAnalyzer()
        
        def make_record(in_t, out_t):
            return UsageRecord(
                timestamp="2026-06-15T10:00:00",
                session_id="test_session",
                project="test_project",
                project_path="/tmp/test",
                model="claude-3-5-sonnet",
                provider="anthropic",
                input_tokens=in_t,
                output_tokens=out_t,
                latency_ms=100
            )

        cost_1 = analyzer.calculate_cost(make_record(input_tokens, output_tokens))
        cost_2 = analyzer.calculate_cost(make_record(input_tokens * 2, output_tokens * 2))
        
        # Sử dụng pytest.approx để xử lý vấn đề sai số dấu phẩy động (floating point errors)
        assert cost_2 == pytest.approx(cost_1 * 2)
