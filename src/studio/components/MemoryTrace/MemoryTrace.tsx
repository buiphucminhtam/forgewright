/**
 * MemoryTrace - Displays memory trace timeline
 *
 * Features:
 * - Chronological event display
 * - Filtering by action type
 * - Auto-scroll with pause on hover
 * - Collapsible entries
 */

import React, { useState, useEffect, useRef } from "react";
import { MemoryTraceEvent } from "../../types/studio.js";

interface MemoryTraceProps {
  events: MemoryTraceEvent[];
  maxEvents?: number;
}

const ACTION_ICONS: Record<string, string> = {
  memory: "🧠",
  skill: "⚙️",
  tool: "🔧",
  file: "📄",
  network: "🌐",
  error: "⚠️",
  default: "📌",
};

function getIcon(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (lower.includes(key)) {
      return icon;
    }
  }
  return ACTION_ICONS.default;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(timestamp: number, baseTimestamp: number): string {
  const diff = timestamp - baseTimestamp;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  return `${(diff / 60000).toFixed(1)}m`;
}

export function MemoryTrace({ events, maxEvents = 100 }: MemoryTraceProps) {
  const [filter, setFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);

  const filteredEvents = events.filter((event) => {
    if (filter === "all") return true;
    return event.action.toLowerCase().includes(filter.toLowerCase());
  });

  const displayedEvents = filteredEvents.slice(-maxEvents);

  const baseTimestamp = displayedEvents[0]?.timestamp || Date.now();

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && !isHoveringRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedEvents, autoScroll]);

  const handleMouseEnter = () => {
    isHoveringRef.current = true;
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  };

  const actionTypes = Array.from(
    new Set(events.map((e) => e.action.split(":")[0]))
  );

  return (
    <div className="flex flex-col h-full bg-[#101010] text-[#f2f2f2]">
      {/* Header */}
      <div className="p-3 border-b border-[#3d3a39] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#f2f2f2]">Memory Trace</h3>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs bg-[#1a1a1a] border border-[#3d3a39] text-[#f2f2f2] rounded px-2 py-1 focus:outline-none focus:border-[#00d992]"
          >
            <option value="all">All</option>
            {actionTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              autoScroll
                ? "bg-[#00d992]/20 border-[#00d992] text-[#00d992]"
                : "bg-[#1a1a1a] border-[#3d3a39] text-[#bdbdbd]"
            }`}
          >
            {autoScroll ? "Auto" : "Pause"}
          </button>
        </div>
      </div>

      {/* Event List */}
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex-1 overflow-y-auto p-2 space-y-1 font-mono"
        style={{ maxHeight: "calc(100vh - 300px)" }}
      >
        {displayedEvents.length === 0 ? (
          <div className="text-center text-[#8b949e] py-8">
            <div className="text-2xl mb-2">📜</div>
            <p className="text-sm font-sans">No memory traces yet</p>
          </div>
        ) : (
          displayedEvents.map((event, index) => (
            <div
              key={`${event.timestamp}-${index}`}
              className="flex items-start gap-2 text-xs hover:bg-[#1a1a1a] rounded px-2 py-1 transition-colors"
            >
              <span className="text-[#8b949e] w-16 flex-shrink-0">
                {formatTime(event.timestamp)}
              </span>

              <span className="text-[#3d3a39] w-8 flex-shrink-0 text-right">
                +{formatDuration(event.timestamp, baseTimestamp)}
              </span>

              <span className="flex-shrink-0">{getIcon(event.action)}</span>

              <div className="flex-1 min-w-0">
                <span className="font-semibold text-[#f2f2f2]">
                  {event.action}
                </span>
                <span className="text-[#bdbdbd] ml-2 truncate">
                  {event.detail}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#3d3a39] text-xs text-[#8b949e] text-center font-mono">
        {displayedEvents.length} events
        {filter !== "all" && ` (filtered from ${events.length})`}
      </div>
    </div>
  );
}
