"use client";

import React from "react";
import {
  Play,
  Pause,
  CloudRain,
  AlertOctagon,
  RotateCcw,
  ZapOff,
  Gauge,
  Sliders,
} from "lucide-react";

interface ControlPanelProps {
  isPaused: boolean;
  cloudDropActive: boolean;
  voltageSpikeActive: boolean;
  peersDisabled: boolean;
  onTogglePause: () => void;
  onTriggerCloudDrop: () => void;
  onTriggerVoltageSpike: () => void;
  onTogglePeers: () => void;
  onReset: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isPaused,
  cloudDropActive,
  voltageSpikeActive,
  peersDisabled,
  onTogglePause,
  onTriggerCloudDrop,
  onTriggerVoltageSpike,
  onTogglePeers,
  onReset,
}) => {
  return (
    <div className="glass-panel p-3.5 rounded-xl border border-slate-800 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>HACKATHON DEMO PRESETS</span>
        </div>
        <button
          onClick={onReset}
          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-slate-800"
          title="Reset Simulation"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Preset Action Buttons */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {/* Passing Cloud Drop */}
        <button
          onClick={onTriggerCloudDrop}
          className={`p-2 rounded-lg border flex items-center gap-2 transition-all ${
            cloudDropActive
              ? "bg-amber-950/80 border-amber-500 text-amber-200 animate-pulse"
              : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-amber-500/50 hover:bg-slate-800/60"
          }`}
        >
          <CloudRain className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="text-left">
            <div className="font-bold">Passing Cloud</div>
            <div className="text-[10px] text-slate-400 font-sans">-75% Solar Drop</div>
          </div>
        </button>

        {/* Voltage Spike */}
        <button
          onClick={onTriggerVoltageSpike}
          className={`p-2 rounded-lg border flex items-center gap-2 transition-all ${
            voltageSpikeActive
              ? "bg-red-950/80 border-red-500 text-red-200 animate-pulse"
              : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-red-500/50 hover:bg-slate-800/60"
          }`}
        >
          <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
          <div className="text-left">
            <div className="font-bold">Voltage Spike</div>
            <div className="text-[10px] text-slate-400 font-sans">255.4V Cedar Trip</div>
          </div>
        </button>

        {/* Peers Disabled (Counterfactual) */}
        <button
          onClick={onTogglePeers}
          className={`p-2 rounded-lg border flex items-center gap-2 transition-all ${
            peersDisabled
              ? "bg-purple-950/80 border-purple-500 text-purple-200"
              : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-purple-500/50 hover:bg-slate-800/60"
          }`}
        >
          <ZapOff className="w-4 h-4 text-purple-400 shrink-0" />
          <div className="text-left">
            <div className="font-bold">Peers Disabled</div>
            <div className="text-[10px] text-slate-400 font-sans">Counterfactual Test</div>
          </div>
        </button>

        {/* Play/Pause */}
        <button
          onClick={onTogglePause}
          className={`p-2 rounded-lg border flex items-center gap-2 transition-all ${
            isPaused
              ? "bg-cyan-950/80 border-cyan-500 text-cyan-200"
              : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800/60"
          }`}
        >
          {isPaused ? (
            <Play className="w-4 h-4 text-cyan-400 shrink-0" />
          ) : (
            <Pause className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <div className="text-left">
            <div className="font-bold">{isPaused ? "Resume Sim" : "Pause Sim"}</div>
            <div className="text-[10px] text-slate-400 font-sans">{isPaused ? "Paused" : "Live Stream"}</div>
          </div>
        </button>
      </div>
    </div>
  );
};
