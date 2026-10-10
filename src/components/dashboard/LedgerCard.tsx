"use client";

import React from "react";
import { Landmark, ShieldCheck, ArrowRight, Wallet } from "lucide-react";
import { TransferEvent, NodeState } from "../../engine/router";
import { NeighborhoodLedgerSummary } from "../../engine/ledger";

interface LedgerCardProps {
  ledger: NeighborhoodLedgerSummary | null;
  transfers: TransferEvent[];
  selectedNode:
    | (NodeState & { walletBalanceInr?: number; netSavingsVsGridInr?: number })
    | null;
}

export const LedgerCard: React.FC<LedgerCardProps> = ({
  ledger,
  transfers,
  selectedNode,
}) => {
  return (
    <div className="glass-panel p-3.5 rounded-xl border border-slate-800 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <Landmark className="w-3.5 h-3.5 text-emerald-400" />
          <span>FINANCIAL LEDGER & CEDAR AUDIT TRAIL</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 font-bold">
          {ledger?.totalTrades || 0} Trades Settled
        </span>
      </div>

      {/* Selected House Deep-Dive (if clicked) */}
      {selectedNode && (
        <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/60 font-mono text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-cyan-400" />
              <span>{selectedNode.id.replace("_", " ")}</span>
            </span>
            <span
              className={`font-bold ${
                (selectedNode.walletBalanceInr || 0) >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              Wallet: ₹{(selectedNode.walletBalanceInr || 0).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-300">
            <span>Net Savings vs Grid:</span>
            <span className="text-emerald-400 font-bold">
              ₹{(selectedNode.netSavingsVsGridInr || 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Active / Recent Cedar-Audited Transactions */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
          Live Peer Routing Decisions:
        </div>
        {transfers.length === 0 ? (
          <div className="p-3 rounded bg-slate-900/40 border border-slate-800 text-[11px] text-slate-400 text-center font-mono">
            No active peer transfers in this tick (Local generation absorbed or curtailed).
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {transfers.map((tx) => (
              <div
                key={`${tx.tradeId}_${tx.from}_${tx.to}`}
                className="p-2 rounded bg-slate-900/80 border border-slate-800 text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between text-slate-200">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-amber-400">{tx.from}</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span className="font-bold text-purple-400">{tx.to}</span>
                  </div>
                  <span className="font-bold text-cyan-300">
                    {tx.kw.toFixed(2)} kW (₹{tx.totalInr?.toFixed(2) || "0.00"})
                  </span>
                </div>
                {/* Cedar policy trace */}
                <div className="text-[10px] text-slate-400 bg-slate-950/80 p-1 rounded border border-slate-800/60 font-mono flex items-start gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="truncate" title={tx.cedarTrace}>
                    {tx.cedarTrace}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
