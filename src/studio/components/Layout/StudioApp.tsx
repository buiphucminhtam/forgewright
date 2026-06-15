/**
 * StudioApp - Main Forgewright Studio application
 *
 * Features:
 * - Real-time pipeline monitoring
 * - Memory trace timeline
 * - Token/Cost tracking
 * - Session history
 */

import React, { useState } from "react";
import { PipelineMonitor } from "./PipelineMonitor/PipelineMonitor";
import { MemoryTrace } from "./MemoryTrace/MemoryTrace";
import { StatsPanel } from "./StatsPanel/StatsPanel";
import { usePipeline } from "../hooks/usePipeline";
import { MemoryTraceEvent } from "../types/studio.js";

interface StudioAppProps {
  sessionId?: string;
  wsUrl?: string;
}

type TabType = "pipeline" | "memory" | "stats";

export function StudioApp({ sessionId, wsUrl = "ws://localhost:7891" }: StudioAppProps) {
  const [activeTab, setActiveTab] = useState<TabType>("pipeline");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const {
    session,
    phases,
    events,
    metrics,
    isConnected,
    isRunning,
    connect,
    disconnect,
  } = usePipeline({ sessionId, wsUrl, autoConnect: true });

  // Filter memory trace events
  const memoryEvents: MemoryTraceEvent[] = events.filter(
    (e) => e.type === "memory:trace"
  ) as MemoryTraceEvent[];

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "pipeline", label: "Pipeline", icon: "📊" },
    { id: "memory", label: "Memory", icon: "🧠" },
    { id: "stats", label: "Stats", icon: "📈" },
  ];

  return (
    <div className="flex h-screen bg-[#101010]">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? "w-16" : "w-64"
        } bg-[#1a1a1a] border-r border-[#3d3a39] flex flex-col transition-all duration-200`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-[#3d3a39]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#00d992] to-[#10b981] rounded-lg flex items-center justify-center text-[#101010] font-bold text-sm">
              FW
            </div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="font-bold text-[#f2f2f2]">Studio</h1>
                <p className="text-xs text-[#8b949e]">Forgewright</p>
              </div>
            )}
          </div>
        </div>

        {/* Session Info */}
        {!sidebarCollapsed && session && (
          <div className="p-4 border-b border-[#3d3a39]">
            <div className="text-xs text-[#8b949e] mb-1">Current Session</div>
            <div className="font-mono text-sm text-[#f2f2f2] truncate">
              {session.id.slice(0, 8)}
            </div>
            <div className="text-xs text-[#8b949e] mt-1">
              Mode: {session.mode}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded mb-1 transition-colors ${
                activeTab === tab.id
                  ? "bg-[#101010] text-[#00d992] border-l-2 border-[#00d992]"
                  : "text-[#bdbdbd] hover:bg-[#101010] hover:text-[#f2f2f2]"
              }`}
            >
              <span>{tab.icon}</span>
              {!sidebarCollapsed && (
                <span className="text-sm font-medium">{tab.label}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-4 border-t border-[#3d3a39] text-[#8b949e] hover:text-[#f2f2f2] text-center"
        >
          {sidebarCollapsed ? "→" : "←"}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-[#1a1a1a] border-b border-[#3d3a39] px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-[#f2f2f2]">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h2>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-[#00d992]" : "bg-[#3d3a39]"
                }`}
              />
              <span className="text-xs text-[#8b949e]">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            {/* Session Status */}
            {session && (
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono ${
                  isRunning
                    ? "bg-[#00d992]/20 text-[#00d992] border border-[#00d992]/30"
                    : session.status === "complete"
                      ? "bg-[#2fd6a1]/20 text-[#2fd6a1] border border-[#2fd6a1]/30"
                      : "bg-red-950 text-red-400 border border-red-900"
                }`}
              >
                {isRunning
                  ? "RUNNING"
                  : session.status === "complete"
                    ? "COMPLETE"
                    : "ERROR"}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!isConnected ? (
              <button
                onClick={connect}
                className="px-3 py-1.5 bg-[#00d992] text-[#101010] text-sm font-semibold rounded hover:bg-[#2fd6a1] transition-colors"
              >
                Connect
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="px-3 py-1.5 bg-[#1a1a1a] border border-[#3d3a39] text-[#bdbdbd] text-sm rounded hover:bg-[#101010] hover:text-[#f2f2f2] transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "pipeline" && (
            <div className="h-full overflow-y-auto">
              <PipelineMonitor phases={phases} isRunning={isRunning} />
            </div>
          )}

          {activeTab === "memory" && (
            <div className="h-full">
              <MemoryTrace events={memoryEvents} />
            </div>
          )}

          {activeTab === "stats" && (
            <div className="h-full overflow-y-auto">
              <StatsPanel metrics={metrics} isRunning={isRunning} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
