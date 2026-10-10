"use client";

import React from "react";
import { BrainCircuit, Cpu } from "lucide-react";
import { NeighborhoodForecast } from "../../ml/forecaster";

interface ForecastMatrixProps {
  forecast: NeighborhoodForecast | null;
}

export const ForecastMatrix: React.FC<ForecastMatrixProps> = ({ forecast }) => {
  if (!forecast) return null;

  return (
    <div className="glass-panel p-3.5 rounded-xl border border-slate-800 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
          <span>ML MULTI-HORIZON FORECASTER (RIDGE REGRESSION)</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          Cloud: <strong className="text-amber-400">{forecast.cloudCoverPct}%</strong>
        </span>
      </div>

      {/* Multi-horizon Prediction Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-[10px]">
              <th className="pb-1.5 font-medium">Horizon</th>
              <th className="pb-1.5 font-medium text-amber-400">Solar (kW)</th>
              <th className="pb-1.5 font-medium text-rose-400">Load (kW)</th>
              <th className="pb-1.5 font-medium">Net (kW)</th>
              <th className="pb-1.5 font-medium text-right">Conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {forecast.horizons.map((h) => {
              const isSurplus = h.netSurplusKw > 0;
              return (
                <tr key={h.lookaheadMinutes} className="hover:bg-slate-800/20">
                  <td className="py-1 text-slate-300 font-semibold">
                    +{h.lookaheadMinutes}m
                  </td>
                  <td className="py-1 text-amber-300">
                    {h.predictedSolarKw.toFixed(1)}
                  </td>
                  <td className="py-1 text-rose-300">
                    {h.predictedLoadKw.toFixed(1)}
                  </td>
                  <td
                    className={`py-1 font-bold ${
                      isSurplus ? "text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    {isSurplus ? `+${h.netSurplusKw.toFixed(1)}` : h.netSurplusKw.toFixed(1)}
                  </td>
                  <td className="py-1 text-right text-slate-400">
                    {h.confidencePct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bedrock Agentic Reasoning */}
      {forecast.bedrockAgentExplanation && (
        <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-200 flex items-start gap-2">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <span className="font-bold text-cyan-300 mr-1">[Amazon Bedrock AI Reasoning]:</span>
            <span>{forecast.bedrockAgentExplanation.replace(/\[Bedrock.*?\]:\s*/, "")}</span>
          </div>
        </div>
      )}
    </div>
  );
};
