#!/usr/bin/env python3
"""
Token Usage Analyzer CLI for ForgeWright

Analyze and report LLM token usage across projects.

Usage:
    python3 scripts/token-analyzer.py --project forgewright --period week
    python3 scripts/token-analyzer.py --list-projects
    python3 scripts/token-analyzer.py --dashboard
"""

import json
import os
import argparse
from datetime import datetime, timedelta
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Provider pricing (USD per 1M tokens)
PRICING = {
    "anthropic": {
        "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
        "claude-3-5-sonnet": {"input": 3.0, "output": 15.0},
        "claude-3-opus-20240229": {"input": 15.0, "output": 75.0},
        "claude-3-opus": {"input": 15.0, "output": 75.0},
        "claude-3-sonnet-20240229": {"input": 3.0, "output": 15.0},
        "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
        "claude-3-haiku": {"input": 0.25, "output": 1.25},
        "claude-3-5-haiku-20241022": {"input": 0.8, "output": 4.0},
        "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
        "claude-sonnet-4": {"input": 3.0, "output": 15.0},
    },
    "openai": {
        "gpt-4o": {"input": 2.5, "output": 10.0},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.0, "output": 30.0},
        "gpt-4": {"input": 30.0, "output": 60.0},
        "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
        "gpt-4o-2024-08-06": {"input": 2.5, "output": 10.0},
        "gpt-4o-mini-2024-07-18": {"input": 0.15, "output": 0.60},
    },
    "google": {
        "gemini-2.5-pro": {"input": 1.25, "output": 5.0},
        "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
        "gemini-2.0-flash": {"input": 0.0, "output": 0.0},
        "gemini-1.5-pro": {"input": 1.25, "output": 5.0},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    },
}


@dataclass
class UsageRecord:
    timestamp: str
    session_id: str
    project: str
    project_path: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    skill: Optional[str] = None
    mode: Optional[str] = None


class TokenAnalyzer:
    def __init__(self, project_path: str = None):
        self.home = os.path.expanduser("~")
        self.base_path = Path(self.home) / ".forgewright" / "usage"

        if project_path:
            self.project_name = Path(project_path).name
            self.project_path = project_path
            self.usage_dir = self.base_path / self.project_name
        else:
            self.project_name = Path(os.getcwd()).name
            self.project_path = os.getcwd()
            self.usage_dir = self.base_path / self.project_name

    def list_projects(self) -> list[str]:
        """List all tracked projects."""
        if not self.base_path.exists():
            return []
        return sorted([d.name for d in self.base_path.iterdir() if d.is_dir()])

    def load_records(self, period: str = "week") -> list[UsageRecord]:
        """Load all records for the given period."""
        records = []
        days = {"day": 1, "week": 7, "month": 30, "all": 365}[period]

        for i in range(days):
            date = self._get_date_offset(i)
            file = self.usage_dir / f"{date}.jsonl"

            if file.exists():
                with open(file) as f:
                    for line in f:
                        if line.strip() and not line.startswith(
                            "{"
                        ):  # Skip malformed lines
                            continue
                        try:
                            data = json.loads(line)
                            records.append(
                                UsageRecord(
                                    timestamp=data.get("timestamp", ""),
                                    session_id=data.get("sessionId", ""),
                                    project=data.get("project", self.project_name),
                                    project_path=data.get(
                                        "projectPath", self.project_path
                                    ),
                                    model=data.get("model", ""),
                                    provider=data.get("provider", ""),
                                    input_tokens=data.get("inputTokens", 0),
                                    output_tokens=data.get("outputTokens", 0),
                                    latency_ms=data.get("latencyMs", 0),
                                    skill=data.get("skill"),
                                    mode=data.get("mode"),
                                )
                            )
                        except json.JSONDecodeError:
                            continue

        return records

    def calculate_cost(self, record: UsageRecord) -> float:
        """Calculate cost for a single record."""
        provider_prices = PRICING.get(record.provider, {})

        # Try exact match first
        prices = provider_prices.get(record.model)

        # Try partial match
        if not prices:
            for key, value in provider_prices.items():
                if key in record.model or record.model in key:
                    prices = value
                    break

        if not prices:
            return 0.0

        input_cost = (record.input_tokens / 1_000_000) * prices["input"]
        output_cost = (record.output_tokens / 1_000_000) * prices["output"]
        return input_cost + output_cost

    def generate_summary(self, records: list[UsageRecord]) -> dict:
        """Generate summary statistics."""
        total_input = sum(r.input_tokens for r in records)
        total_output = sum(r.output_tokens for r in records)
        total_calls = len(records)
        total_latency = sum(r.latency_ms for r in records)

        # Calculate cost
        total_cost = sum(self.calculate_cost(r) for r in records)

        # By provider
        by_provider = defaultdict(
            lambda: {"input": 0, "output": 0, "calls": 0, "cost": 0.0}
        )
        for r in records:
            by_provider[r.provider]["input"] += r.input_tokens
            by_provider[r.provider]["output"] += r.output_tokens
            by_provider[r.provider]["calls"] += 1
            by_provider[r.provider]["cost"] += self.calculate_cost(r)

        # By model
        by_model = defaultdict(
            lambda: {"input": 0, "output": 0, "calls": 0, "cost": 0.0}
        )
        for r in records:
            by_model[r.model]["input"] += r.input_tokens
            by_model[r.model]["output"] += r.output_tokens
            by_model[r.model]["calls"] += 1
            by_model[r.model]["cost"] += self.calculate_cost(r)

        # By skill
        by_skill = defaultdict(
            lambda: {"input": 0, "output": 0, "calls": 0, "cost": 0.0}
        )
        for r in records:
            skill_name = r.skill or "unknown"
            by_skill[skill_name]["input"] += r.input_tokens
            by_skill[skill_name]["output"] += r.output_tokens
            by_skill[skill_name]["calls"] += 1
            by_skill[skill_name]["cost"] += self.calculate_cost(r)

        # By session
        by_session = defaultdict(lambda: {"calls": 0, "tokens": 0, "cost": 0.0})
        for r in records:
            by_session[r.session_id]["calls"] += 1
            by_session[r.session_id]["tokens"] += r.input_tokens + r.output_tokens
            by_session[r.session_id]["cost"] += self.calculate_cost(r)

        return {
            "project": self.project_name,
            "project_path": self.project_path,
            "period_days": len(records),
            "summary": {
                "total_input_tokens": total_input,
                "total_output_tokens": total_output,
                "total_tokens": total_input + total_output,
                "total_calls": total_calls,
                "total_cost_usd": round(total_cost, 4),
                "avg_latency_ms": round(total_latency / max(total_calls, 1), 2)
                if total_calls > 0
                else 0,
                "avg_tokens_per_call": round(
                    (total_input + total_output) / max(total_calls, 1)
                )
                if total_calls > 0
                else 0,
            },
            "by_provider": dict(by_provider),
            "by_model": dict(by_model),
            "by_skill": dict(by_skill),
            "by_session": dict(by_session),
            "generated_at": datetime.now().isoformat(),
        }

    def get_daily_usage(self, records: list[UsageRecord], days: int = 7) -> list[dict]:
        """Get daily usage for trend analysis."""
        daily_data = {}

        # Initialize all days
        for i in range(days - 1, -1, -1):
            date = self._get_date_offset(i)
            daily_data[date] = {"input": 0, "output": 0, "calls": 0, "cost": 0.0}

        # Populate
        for r in records:
            date = r.timestamp.split("T")[0]
            if date in daily_data:
                daily_data[date]["input"] += r.input_tokens
                daily_data[date]["output"] += r.output_tokens
                daily_data[date]["calls"] += 1
                daily_data[date]["cost"] += self.calculate_cost(r)

        return [
            {
                "date": date,
                "input_tokens": data["input"],
                "output_tokens": data["output"],
                "total_tokens": data["input"] + data["output"],
                "calls": data["calls"],
                "cost_usd": round(data["cost"], 4),
            }
            for date, data in sorted(daily_data.items())
        ]

    def export_json(self, data: dict, output: str):
        """Export data as JSON."""
        with open(output, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Exported JSON to: {output}")

    def export_csv(self, records: list[UsageRecord], output: str):
        """Export records as CSV."""
        import csv

        with open(output, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "timestamp",
                    "session_id",
                    "model",
                    "provider",
                    "input_tokens",
                    "output_tokens",
                    "latency_ms",
                    "cost_usd",
                    "skill",
                    "mode",
                ]
            )
            for r in records:
                writer.writerow(
                    [
                        r.timestamp,
                        r.session_id,
                        r.model,
                        r.provider,
                        r.input_tokens,
                        r.output_tokens,
                        r.latency_ms,
                        f"{self.calculate_cost(r):.6f}",
                        r.skill or "",
                        r.mode or "",
                    ]
                )
        print(f"Exported CSV to: {output}")

    def export_markdown(self, summary: dict, daily: list[dict], output: str):
        """Export report as Markdown."""
        s = summary["summary"]
        lines = [
            f"# Token Usage Report: {summary['project']}",
            "",
            f"**Period:** Last {summary['period_days']} days",
            f"**Generated:** {summary['generated_at']}",
            "",
            "## Summary",
            "",
            "| Metric | Value |",
            "|---------|-------|",
            f"| Total Input Tokens | {s['total_input_tokens']:,} |",
            f"| Total Output Tokens | {s['total_output_tokens']:,} |",
            f"| **Total Tokens** | **{s['total_tokens']:,}** |",
            f"| Total Calls | {s['total_calls']:,} |",
            f"| **Total Cost** | **${s['total_cost_usd']:.4f}** |",
            f"| Avg Latency | {s['avg_latency_ms']}ms |",
            "",
            "## By Provider",
            "",
        ]

        # Provider table
        if summary["by_provider"]:
            lines.extend(
                [
                    "| Provider | Input Tokens | Output Tokens | Calls | Cost |",
                    "|----------|-------------|--------------|-------|------|",
                ]
            )
            for provider, data in sorted(
                summary["by_provider"].items(), key=lambda x: -x[1]["cost"]
            ):
                lines.append(
                    f"| {provider} | {data['input']:,} | {data['output']:,} | {data['calls']} | ${data['cost']:.4f} |"
                )
            lines.append("")

        # Model table
        if summary["by_model"]:
            lines.extend(["## By Model", ""])
            lines.extend(
                [
                    "| Model | Tokens | Calls | Cost |",
                    "|-------|--------|-------|------|",
                ]
            )
            for model, data in sorted(
                summary["by_model"].items(), key=lambda x: -x[1]["cost"]
            )[:10]:
                lines.append(
                    f"| {model} | {data['input'] + data['output']:,} | {data['calls']} | ${data['cost']:.4f} |"
                )
            lines.append("")

        # Daily trend
        if daily:
            lines.extend(["## Daily Trend", ""])
            lines.extend(
                [
                    "| Date | Input | Output | Total | Calls | Cost |",
                    "|------|-------|--------|-------|-------|------|",
                ]
            )
            for d in daily:
                lines.append(
                    f"| {d['date']} | {d['input_tokens']:,} | {d['output_tokens']:,} | {d['total_tokens']:,} | {d['calls']} | ${d['cost_usd']:.4f} |"
                )

        with open(output, "w") as f:
            f.write("\n".join(lines))
        print(f"Exported Markdown to: {output}")

    def _get_date_offset(self, days: int) -> str:
        """Get date string offset by N days."""
        date = datetime.now() - timedelta(days=days)
        return date.strftime("%Y-%m-%d")


def print_summary(summary: dict, daily: list[dict]):
    """Print human-readable summary to console."""
    s = summary["summary"]

    print("\n" + "=" * 60)
    print(f" TOKEN USAGE REPORT: {summary['project']}")
    print("=" * 60)

    print(f"\n📊 Summary (Last {summary['period_days']} days)")
    print(f"   ├─ Total Tokens:     {s['total_tokens']:>12,} tokens")
    print(f"   │   ├─ Input:        {s['total_input_tokens']:>12,} tokens")
    print(f"   │   └─ Output:       {s['total_output_tokens']:>12,} tokens")
    print(f"   ├─ Total Calls:      {s['total_calls']:>12,}")
    print(f"   ├─ Total Cost:       ${s['total_cost_usd']:>11.4f}")
    print(f"   └─ Avg Latency:      {s['avg_latency_ms']:>11}ms")

    if summary["by_provider"]:
        print("\n🏢 By Provider")
        for provider, data in sorted(
            summary["by_provider"].items(), key=lambda x: -x[1]["cost"]
        ):
            print(
                f"   {provider:15} {data['input'] + data['output']:>10,} tokens  ${data['cost']:.4f}  ({data['calls']} calls)"
            )

    if summary["by_model"]:
        print("\n🤖 Top Models")
        for model, data in sorted(
            summary["by_model"].items(), key=lambda x: -x[1]["cost"]
        )[:5]:
            name = (
                model.split("-")[0].capitalize() + " " + "-".join(model.split("-")[1:3])
            )
            print(
                f"   {name:25} {data['input'] + data['output']:>10,} tokens  ${data['cost']:.4f}"
            )

    if daily and len(daily) > 1:
        first = daily[0]
        last = daily[-1]
        print("\n📈 Trend (First vs Last Day)")
        print(
            f"   First: {first['date']} - {first['total_tokens']:,} tokens, ${first['cost_usd']:.4f}"
        )
        print(
            f"   Last:  {last['date']} - {last['total_tokens']:,} tokens, ${last['cost_usd']:.4f}"
        )

        # Calculate change
        if first["total_tokens"] > 0:
            change = (
                (last["total_tokens"] - first["total_tokens"]) / first["total_tokens"]
            ) * 100
            direction = "↑" if change > 0 else "↓"
            print(f"   Change: {direction} {abs(change):.1f}%")


def main():
    parser = argparse.ArgumentParser(
        description="Token Usage Analyzer for ForgeWright",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "--project", "-p", help="Project path or name (default: current directory)"
    )
    parser.add_argument(
        "--period",
        choices=["day", "week", "month", "all"],
        default="week",
        help="Analysis period (default: week)",
    )
    parser.add_argument(
        "--list-projects", "-l", action="store_true", help="List all tracked projects"
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["json", "csv", "markdown", "table"],
        default="table",
        help="Output format (default: table)",
    )
    parser.add_argument("--output", "-o", help="Output file path (default: stdout)")
    parser.add_argument(
        "--dashboard-data",
        action="store_true",
        help="Output data in format suitable for dashboard",
    )
    parser.add_argument(
        "--days", type=int, default=7, help="Number of days to analyze (default: 7)"
    )

    args = parser.parse_args()

    # List projects mode
    if args.list_projects:
        analyzer = TokenAnalyzer(args.project)
        projects = analyzer.list_projects()
        if projects:
            print("Tracked Projects:")
            for p in projects:
                print(f"  • {p}")
        else:
            print("No projects tracked yet.")
        return

    # Create analyzer
    analyzer = TokenAnalyzer(args.project)

    # Check if project has data
    if not analyzer.usage_dir.exists():
        print(f"⚠️  No usage data found for project: {analyzer.project_name}")
        print(f"    Data directory: {analyzer.usage_dir}")
        print("\n💡 To start tracking, run ForgeWright with token tracking enabled.")
        return

    # Load records
    records = analyzer.load_records(args.period)

    if not records:
        print(f"⚠️  No records found for period: {args.period}")
        return

    # Generate summary
    summary = analyzer.generate_summary(records)
    daily = analyzer.get_daily_usage(records, args.days)

    # Dashboard data mode
    if args.dashboard_data:
        dashboard_data = {
            "summary": summary["summary"],
            "by_provider": summary["by_provider"],
            "by_model": summary["by_model"],
            "trend": daily,
        }
        if args.output:
            analyzer.export_json(dashboard_data, args.output)
        else:
            print(json.dumps(dashboard_data, indent=2))
        return

    # Export modes
    if args.output:
        if args.format == "json":
            analyzer.export_json({"summary": summary, "daily": daily}, args.output)
        elif args.format == "csv":
            analyzer.export_csv(records, args.output)
        elif args.format == "markdown":
            analyzer.export_markdown(summary, daily, args.output)
        return

    # Table output (default)
    print_summary(summary, daily)

    print("\n" + "=" * 60)
    print(f"📁 Data location: {analyzer.usage_dir}")
    print("💡 Use --format json|csv|markdown -o file to export")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
