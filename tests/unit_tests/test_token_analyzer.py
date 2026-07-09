"""
Unit tests for TokenAnalyzer.

Tests token usage analysis and cost calculation.
"""

import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

# Load token-analyzer.py (has hyphen in name, need importlib)
_test_file = Path(__file__).resolve()
_project_root = _test_file.parent.parent.parent
_scripts = _project_root / "scripts"

_spec = importlib.util.spec_from_file_location(
    "token_analyzer", _scripts / "telemetry" / "token-analyzer.py"
)
_token_analyzer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_token_analyzer)

# Import from loaded module
TokenAnalyzer = _token_analyzer.TokenAnalyzer
UsageRecord = _token_analyzer.UsageRecord
PRICING = _token_analyzer.PRICING


class TestTokenAnalyzer:
    """Test TokenAnalyzer class."""

    def test_init_default_project(self):
        """Test analyzer initialization with default project."""
        analyzer = TokenAnalyzer()
        assert analyzer.project_name is not None
        assert analyzer.usage_dir.name == analyzer.project_name

    def test_init_with_project_path(self):
        """Test analyzer initialization with project path."""
        analyzer = TokenAnalyzer("/tmp/test-project")
        assert analyzer.project_name == "test-project"
        assert analyzer.project_path == "/tmp/test-project"

    def test_list_projects_empty(self):
        """Test listing projects when no data exists."""
        analyzer = TokenAnalyzer("/tmp/nonexistent-project-xyz")
        projects = analyzer.list_projects()
        assert isinstance(projects, list)


class TestCostCalculation:
    """Test cost calculation logic."""

    def test_calculate_cost_claude(self):
        """Test cost calculation for Claude models."""
        record = UsageRecord(
            timestamp=datetime.now().isoformat(),
            session_id="test-123",
            project="test",
            project_path="/tmp/test",
            model="claude-3-5-sonnet-20241022",
            provider="anthropic",
            input_tokens=1_000_000,
            output_tokens=500_000,
            latency_ms=1000,
        )

        analyzer = TokenAnalyzer()
        cost = analyzer.calculate_cost(record)

        # 1M input @ $3/M = $3, 500K output @ $15/M = $7.50
        expected = 3.0 + 7.5
        assert abs(cost - expected) < 0.01

    def test_calculate_cost_gpt4o(self):
        """Test cost calculation for GPT-4o."""
        record = UsageRecord(
            timestamp=datetime.now().isoformat(),
            session_id="test-456",
            project="test",
            project_path="/tmp/test",
            model="gpt-4o",
            provider="openai",
            input_tokens=1_000_000,
            output_tokens=500_000,
            latency_ms=800,
        )

        analyzer = TokenAnalyzer()
        cost = analyzer.calculate_cost(record)

        # 1M input @ $2.50/M = $2.50, 500K output @ $10/M = $5.00
        expected = 2.5 + 5.0
        assert abs(cost - expected) < 0.01

    def test_calculate_cost_gemini(self):
        """Test cost calculation for Gemini models."""
        record = UsageRecord(
            timestamp=datetime.now().isoformat(),
            session_id="test-789",
            project="test",
            project_path="/tmp/test",
            model="gemini-2.5-flash",
            provider="google",
            input_tokens=1_000_000,
            output_tokens=500_000,
            latency_ms=500,
        )

        analyzer = TokenAnalyzer()
        cost = analyzer.calculate_cost(record)

        # 1M input @ $0.075/M = $0.075, 500K output @ $0.30/M = $0.15
        expected = 0.075 + 0.15
        assert abs(cost - expected) < 0.01

    def test_calculate_cost_unknown_provider(self):
        """Test cost calculation for unknown provider."""
        record = UsageRecord(
            timestamp=datetime.now().isoformat(),
            session_id="test-000",
            project="test",
            project_path="/tmp/test",
            model="unknown-model",
            provider="unknown",
            input_tokens=1_000_000,
            output_tokens=500_000,
            latency_ms=1000,
        )

        analyzer = TokenAnalyzer()
        cost = analyzer.calculate_cost(record)

        # Unknown provider should return 0
        assert cost == 0.0


class TestSummaryGeneration:
    """Test summary generation."""

    def test_generate_summary_empty(self):
        """Test summary with no records."""
        analyzer = TokenAnalyzer()
        summary = analyzer.generate_summary([])

        assert summary["project"] == analyzer.project_name
        assert summary["summary"]["total_tokens"] == 0
        assert summary["summary"]["total_calls"] == 0
        assert summary["summary"]["total_cost_usd"] == 0.0

    def test_generate_summary_single_record(self):
        """Test summary with single record."""
        records = [
            UsageRecord(
                timestamp=datetime.now().isoformat(),
                session_id="test-123",
                project="test",
                project_path="/tmp/test",
                model="claude-3-5-sonnet",
                provider="anthropic",
                input_tokens=1000,
                output_tokens=500,
                latency_ms=1000,
            )
        ]

        analyzer = TokenAnalyzer()
        summary = analyzer.generate_summary(records)

        assert summary["summary"]["total_input_tokens"] == 1000
        assert summary["summary"]["total_output_tokens"] == 500
        assert summary["summary"]["total_tokens"] == 1500
        assert summary["summary"]["total_calls"] == 1
        assert summary["summary"]["avg_tokens_per_call"] == 1500

    def test_generate_summary_by_provider(self):
        """Test summary aggregates by provider."""
        records = [
            UsageRecord(
                timestamp=datetime.now().isoformat(),
                session_id="test-123",
                project="test",
                project_path="/tmp/test",
                model="claude-3-5-sonnet",
                provider="anthropic",
                input_tokens=1000,
                output_tokens=500,
                latency_ms=1000,
            ),
            UsageRecord(
                timestamp=datetime.now().isoformat(),
                session_id="test-456",
                project="test",
                project_path="/tmp/test",
                model="gpt-4o",
                provider="openai",
                input_tokens=2000,
                output_tokens=1000,
                latency_ms=800,
            ),
        ]

        analyzer = TokenAnalyzer()
        summary = analyzer.generate_summary(records)

        assert "anthropic" in summary["by_provider"]
        assert "openai" in summary["by_provider"]
        assert summary["by_provider"]["anthropic"]["calls"] == 1
        assert summary["by_provider"]["openai"]["calls"] == 1

    def test_generate_summary_by_skill(self):
        """Test summary aggregates by skill."""
        records = [
            UsageRecord(
                timestamp=datetime.now().isoformat(),
                session_id="test-123",
                project="test",
                project_path="/tmp/test",
                model="claude-3-5-sonnet",
                provider="anthropic",
                input_tokens=1000,
                output_tokens=500,
                latency_ms=1000,
                skill="software-engineer",
            ),
            UsageRecord(
                timestamp=datetime.now().isoformat(),
                session_id="test-456",
                project="test",
                project_path="/tmp/test",
                model="gpt-4o",
                provider="openai",
                input_tokens=1000,
                output_tokens=500,
                latency_ms=800,
                skill="qa-engineer",
            ),
        ]

        analyzer = TokenAnalyzer()
        summary = analyzer.generate_summary(records)

        assert "software-engineer" in summary["by_skill"]
        assert "qa-engineer" in summary["by_skill"]


class TestDailyUsage:
    """Test daily usage tracking."""

    def test_get_daily_usage_empty(self):
        """Test daily usage with no records."""
        analyzer = TokenAnalyzer()
        daily = analyzer.get_daily_usage([], days=7)

        assert len(daily) == 7
        for d in daily:
            assert d["input_tokens"] == 0
            assert d["output_tokens"] == 0
            assert d["total_tokens"] == 0

    def test_get_daily_usage_with_records(self):
        """Test daily usage with records."""
        today = datetime.now()
        yesterday = today - timedelta(days=1)

        records = [
            UsageRecord(
                timestamp=yesterday.isoformat(),
                session_id="test-123",
                project="test",
                project_path="/tmp/test",
                model="claude-3-5-sonnet",
                provider="anthropic",
                input_tokens=1000,
                output_tokens=500,
                latency_ms=1000,
            ),
            UsageRecord(
                timestamp=today.isoformat(),
                session_id="test-456",
                project="test",
                project_path="/tmp/test",
                model="claude-3-5-sonnet",
                provider="anthropic",
                input_tokens=2000,
                output_tokens=1000,
                latency_ms=1000,
            ),
        ]

        analyzer = TokenAnalyzer()
        daily = analyzer.get_daily_usage(records, days=2)

        assert len(daily) == 2
        # Check that total matches
        total = sum(d["total_tokens"] for d in daily)
        assert total == 4500


class TestPricingConstants:
    """Test pricing constants are valid."""

    def test_pricing_has_required_providers(self):
        """Test pricing has all major providers."""
        assert "anthropic" in PRICING
        assert "openai" in PRICING
        assert "google" in PRICING

    def test_pricing_models_have_input_output(self):
        """Test all models have input and output prices."""
        for provider, models in PRICING.items():
            for model, prices in models.items():
                assert "input" in prices, f"{provider}/{model} missing input price"
                assert "output" in prices, f"{provider}/{model} missing output price"
                assert prices["input"] >= 0
                assert prices["output"] >= 0

    def test_pricing_claude_sonnet(self):
        """Test Claude Sonnet pricing is reasonable."""
        prices = PRICING["anthropic"]["claude-3-5-sonnet-20241022"]
        assert prices["input"] == 3.0
        assert prices["output"] == 15.0

    def test_pricing_gpt4o(self):
        """Test GPT-4o pricing is reasonable."""
        prices = PRICING["openai"]["gpt-4o"]
        assert prices["input"] == 2.5
        assert prices["output"] == 10.0

    def test_pricing_gemini_flash(self):
        """Test Gemini Flash pricing is reasonable."""
        prices = PRICING["google"]["gemini-2.5-flash"]
        assert prices["input"] == 0.075
        assert prices["output"] == 0.30
