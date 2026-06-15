/**
 * StatsPanel - Token/Cost/Performance statistics
 *
 * Features:
 * - Token usage tracking
 * - Cost estimation
 * - Session duration
 * - Error rate
 */

import React from "react";
import { SessionMetrics } from "../../types/studio.js";
import { formatTokens, formatCost } from "../../hooks/useTokenTracker.js";

interface StatsPanelProps {
  metrics: SessionMetrics;
  isRunning: boolean;
}

const METRIC_TEXT_COLORS: Record<string, string> = {
  blue: "text-[#00d992]",
  green: "text-[#00d992]",
  purple: "text-purple-400",
  orange: "text-amber-500",
  red: "text-red-400",
  gray: "text-[#8b949e]",
};

export function StatsPanel({ metrics, isRunning }: StatsPanelProps) {
  const stats = [
    {
      label: "Tokens",
      value: formatTokens(metrics.tokens),
      icon: "💬",
      color: "blue",
    },
    {
      label: "Cost",
      value: formatCost(metrics.cost),
      icon: "💰",
      color: "green",
    },
    {
      label: "Duration",
      value: formatDuration(metrics.duration),
      icon: "⏱️",
      color: "purple",
    },
    {
      label: "Skills",
      value: metrics.skillCount.toString(),
      icon: "⚙️",
      color: "orange",
    },
    {
      label: "Errors",
      value: metrics.errorCount.toString(),
      icon: "⚠️",
      color: metrics.errorCount > 0 ? "red" : "gray",
    },
  ];

  return (
    <div className="p-4 bg-[#101010] text-[#f2f2f2] min-h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#f2f2f2]">Session Stats</h2>
        {isRunning && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d992] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00d992]"></span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-[#1a1a1a] border border-[#3d3a39] rounded p-3 flex flex-col justify-between"
          >
            <div className="flex items-center gap-2 mb-1">
              <span>{stat.icon}</span>
              <span className="text-xs text-[#8b949e]">{stat.label}</span>
            </div>
            <div className={`text-xl font-bold font-mono ${METRIC_TEXT_COLORS[stat.color] || "text-[#f2f2f2]"}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Cost Breakdown */}
      {metrics.cost > 0 && (
        <div className="mt-4 p-3 bg-[#1a1a1a] border border-[#3d3a39] rounded">
          <h3 className="text-sm font-semibold mb-2 text-[#f2f2f2]">Cost Estimate</h3>
          <div className="text-xs text-[#bdbdbd] space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span>GPT-4o Prompt:</span>
              <span className="text-[#8b949e]">
                ${(metrics.tokens * 0.5 * 2.5 / 1_000_000).toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>GPT-4o Completion:</span>
              <span className="text-[#8b949e]">
                ${(metrics.tokens * 0.5 * 10.0 / 1_000_000).toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[#3d3a39] pt-1.5 mt-1 font-semibold text-[#f2f2f2]">
              <span>Total:</span>
              <span className="text-[#00d992]">{formatCost(metrics.cost)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      {metrics.skillCount > 5 && metrics.errorCount === 0 && (
        <div className="mt-4 p-3 bg-[#00d992]/10 border border-[#00d992]/30 rounded">
          <p className="text-xs text-[#2fd6a1]">
            ✓ Great progress! {metrics.skillCount} skills completed with no errors.
          </p>
        </div>
      )}

      {metrics.errorCount > 0 && (
        <div className="mt-4 p-3 bg-red-950/20 border border-red-900/40 rounded">
          <p className="text-xs text-red-400">
            ✕ {metrics.errorCount} error{metrics.errorCount > 1 ? "s" : ""} occurred.
            Check the Memory Trace for details.
          </p>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}
