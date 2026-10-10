"use client";

import React from "react";
import {
  Sun,
  Zap,
  Activity,
  Leaf,
  DollarSign,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { SimulationTickResult } from "../../sim/simulator";

interface HeaderHUDProps {
  data: SimulationTickResult | null;
}

export const HeaderHUD: React.FC<HeaderHUDProps> = ({ data }) => {
  if (!data) return null;

  const totalSolar = data.nodes.reduce((s, n) => s + n.solarKw, 0).toFixed(1);
  const totalLoad = data.nodes.reduce((s, n) => s + n.loadKw, 0).toFixed(1);
  const isOvervoltage = data.feederVoltage >= 253.0;

  return (
    <header className="w-full glass-panel-glow px-4 py-3 rounded-xl flex flex-wrap items-center justify-between gap-4 border border-cyan-500/20 shadow-2xl">
      {/* Brand & Time */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-amber-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Zap className="w-5 h-5 text-slate-950 font-bold" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-black tracking-wide text-white font-mono">
              SOLNET<span className="text-cyan-400">.AI</span>
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
              VIRTUAL MICROGRID
            </span>
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Simulated Time: <strong className="text-slate-200">{data.timeOfDay}</strong></span>
            <span className="text-slate-600">•</span>
            <span>Tick <strong className="text-slate-200">#{data.tick}</strong>/96</span>
          </p>
        </div>
      </div>

      {/* Grid Physics Meters */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs font-mono">
        {/* Feeder Voltage */}
        <div
          className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 transition-colors ${
            isOvervoltage
              ? "bg-red-950/70 border-red-500 text-red-200 animate-pulse"
              : "bg-slate-900/60 border-slate-700/60 text-slate-200"
          }`}
        >
          <Activity className={`w-4 h-4 ${isOvervoltage ? "text-red-400" : "text-cyan-400"}`} />
          <div>
            <div className="text-[10px] text-slate-400 leading-none">Feeder Line</div>
            <div className="font-bold flex items-center gap-1">
              <span>{data.feederVoltage} V</span>
              {isOvervoltage && (
                <span className="text-[9px] bg-red-800 text-white px-1 rounded font-sans">TRIP</span>
              )}
            </div>
          </div>
        </div>

        {/* Solar Generation */}
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/60 flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-400" />
          <div>
            <div className="text-[10px] text-slate-400 leading-none">Rooftop Solar</div>
            <div className="font-bold text-amber-300">{totalSolar} kW</div>
          </div>
        </div>

        {/* Load Consumption */}
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/60 flex items-center gap-2">
          <Zap className="w-4 h-4 text-rose-400" />
          <div>
            <div className="text-[10px] text-slate-400 leading-none">Total Load</div>
            <div className="font-bold text-rose-300">{totalLoad} kW</div>
          </div>
        </div>

        {/* P2P Cleared Price */}
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-cyan-800/40 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-[10px] text-slate-400 leading-none">P2P Tariff</div>
            <div className="font-bold text-cyan-300">₹{data.tariff.unitPriceInr.toFixed(2)}/kWh</div>
          </div>
        </div>

        {/* Community Savings */}
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-emerald-800/40 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] text-slate-400 leading-none">Net Savings</div>
            <div className="font-bold text-emerald-300">₹{data.ledger.totalNeighborhoodSavingsInr}</div>
          </div>
        </div>

        {/* CO2 Offset */}
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-teal-800/40 flex items-center gap-2">
          <Leaf className="w-4 h-4 text-teal-400" />
          <div>
            <div className="text-[10px] text-slate-400 leading-none">CO₂ Avoided</div>
            <div className="font-bold text-teal-300">{data.ledger.totalCo2OffsetKg} kg</div>
          </div>
        </div>
      </div>
    </header>
  );
};
