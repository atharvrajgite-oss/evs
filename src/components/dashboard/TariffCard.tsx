"use client";

import React from "react";
import { TrendingUp, Percent, Sparkles, Scale } from "lucide-react";
import { DynamicTariffQuote } from "../../agent/tariffAgent";

interface TariffCardProps {
  tariff: DynamicTariffQuote | null;
}

export const TariffCard: React.FC<TariffCardProps> = ({ tariff }) => {
  if (!tariff) return null;

  const floor = tariff.floorPriceInr;
  const ceiling = tariff.ceilingPriceInr;
  const price = tariff.unitPriceInr;
  const pctAlongSpread = Math.min(
    100,
    Math.max(0, ((price - floor) / (ceiling - floor)) * 100)
  );

  return (
    <div className="glass-panel p-3.5 rounded-xl border border-slate-800 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <Scale className="w-3.5 h-3.5 text-amber-400" />
          <span>DYNAMIC P2P TARIFF GOVERNOR</span>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
            tariff.pricingRegime === "ABUNDANCE_EV_ABSORB"
              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
              : tariff.pricingRegime === "HIGH_SCARCITY_RESERVE"
              ? "bg-rose-950/80 text-rose-300 border border-rose-800"
              : "bg-cyan-950/80 text-cyan-300 border border-cyan-800"
          }`}
        >
          {tariff.pricingRegime.replace(/_/g, " ")}
        </span>
      </div>

      {/* Main Cleared Price Display */}
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-black font-mono text-white tracking-tight">
            ₹{tariff.unitPriceInr.toFixed(2)}
          </span>
          <span className="text-xs text-slate-400 font-mono ml-1">/ kWh</span>
        </div>
        <div className="text-right text-xs font-mono">
          <span className="text-slate-400">Scarcity Index: </span>
          <strong className="text-cyan-300">{(tariff.scarcityIndex * 100).toFixed(0)}%</strong>
        </div>
      </div>

      {/* Dynamic Price Bound Slider */}
      <div className="space-y-1">
        <div className="w-full bg-slate-800 h-2 rounded-full relative overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-500"
            style={{ width: `${pctAlongSpread}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span>Feed-in Floor: ₹{floor.toFixed(2)}</span>
          <span className="text-amber-400 font-bold">P2P: ₹{price.toFixed(2)}</span>
          <span>Utility Ceiling: ₹{ceiling.toFixed(2)}</span>
        </div>
      </div>

      {/* Win-Win Economics Banner */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
        <div className="p-2 rounded bg-slate-900/70 border border-slate-800">
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span>Solar Prosumer</span>
          </div>
          <div className="font-bold text-emerald-300 mt-0.5">
            +{tariff.sellerPremiumPct}% vs Grid
          </div>
        </div>

        <div className="p-2 rounded bg-slate-900/70 border border-slate-800">
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <Percent className="w-3 h-3 text-cyan-400" />
            <span>Neighbor Consumer</span>
          </div>
          <div className="font-bold text-cyan-300 mt-0.5">
            -{tariff.buyerDiscountPct}% vs Utility
          </div>
        </div>
      </div>

      {/* AI Pricing Rationale */}
      <div className="p-2 rounded bg-slate-900/50 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-tight">{tariff.rationale}</p>
      </div>
    </div>
  );
};
