/**
 * PipelineMonitor - Displays pipeline execution progress
 *
 * Features:
 * - Phase timeline with expandable skills
 * - Real-time status updates
 * - Duration and error display
 */

import React, { useState } from "react";
import { Phase, Skill } from "../../types/studio.js";

interface PipelineMonitorProps {
  phases: Phase[];
  isRunning: boolean;
}

const STATUS_COLORS = {
  pending: "bg-[#3d3a39]",
  running: "bg-[#00d992] animate-pulse",
  complete: "bg-[#2fd6a1]",
  error: "bg-red-500",
};

const STATUS_ICONS = {
  pending: "○",
  running: "◐",
  complete: "●",
  error: "✕",
};

export function PipelineMonitor({ phases, isRunning }: PipelineMonitorProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  if (phases.length === 0) {
    return (
      <div className="p-4 text-[#8b949e] text-center bg-[#101010] h-full flex flex-col justify-center items-center">
        <div className="text-4xl mb-2">📊</div>
        <p className="text-[#f2f2f2] font-semibold">No pipeline activity</p>
        <p className="text-xs mt-1 text-[#8b949e]">
          Start a pipeline to see real-time progress
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#101010] text-[#f2f2f2] min-h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#f2f2f2]">Pipeline Progress</h2>
        {isRunning && (
          <span className="text-xs bg-[#00d992]/20 text-[#00d992] border border-[#00d992]/30 px-2 py-0.5 rounded font-mono animate-pulse">
            RUNNING
          </span>
        )}
      </div>

      <div className="space-y-3">
        {phases.map((phase, index) => (
          <div
            key={phase.id}
            className="border border-[#3d3a39] bg-[#1a1a1a] rounded overflow-hidden"
          >
            {/* Phase Header */}
            <button
              onClick={() => togglePhase(phase.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#101010] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${STATUS_COLORS[phase.status]}`}
                />
                <span className="text-[#8b949e] font-mono text-sm">{String(index + 1).padStart(2, "0")}</span>
                <span className="font-semibold text-[#f2f2f2]">{phase.name}</span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm font-mono text-[#bdbdbd]">
                  {phase.progress}%
                </span>
                <span className="text-[#8b949e] text-xs">
                  {expandedPhases.has(phase.id) ? "▼" : "▶"}
                </span>
              </div>
            </button>

            {/* Progress Bar */}
            <div className="h-1 bg-[#3d3a39]">
              <div
                className={`h-full transition-all duration-300 ${STATUS_COLORS[phase.status]}`}
                style={{ width: `${phase.progress}%` }}
              />
            </div>

            {/* Skills (Expanded) */}
            {expandedPhases.has(phase.id) && phase.skills.length > 0 && (
              <div className="px-4 py-3 bg-[#101010] border-t border-[#3d3a39]">
                <div className="space-y-2.5">
                  {phase.skills.map((skill) => (
                    <SkillItem key={skill.id} skill={skill} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillItem({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-start gap-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[#8b949e] hover:text-[#f2f2f2] mt-0.5"
      >
        <span
          className={`text-sm ${STATUS_COLORS[skill.status].includes("animate-pulse") ? "animate-spin" : ""}`}
        >
          {STATUS_ICONS[skill.status]}
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#f2f2f2] truncate">{skill.name}</span>
          <span className="text-xs font-mono text-[#8b949e]">{skill.progress}%</span>
        </div>

        {skill.message && (
          <p className="text-xs text-[#bdbdbd] mt-1 truncate font-mono">
            {skill.message}
          </p>
        )}

        {expanded && skill.message && (
          <pre className="text-xs text-[#bdbdbd] mt-1.5 p-2 bg-[#1a1a1a] rounded border border-[#3d3a39] whitespace-pre-wrap font-mono">
            {skill.message}
          </pre>
        )}
      </div>
    </div>
  );
}
