/**
 * SolNet AI - Person 2 & 3: 5-Tier Priority Energy Router
 *
 * Implements deterministic merit-order dispatch:
 * 1. Self-Consumption (Household base & appliance demand)
 * 2. Self-Storage Charging (Up to 95% SoC, capped at 3.0 kW charge rate)
 * 3. P2P Neighbor Routing (Cedar policy-gated matching)
 * 4. Utility Grid Export (Feed-in tariff clear)
 * 5. Curtailment Safety (Throttles inverters if feeder voltage >= 253V)
 *
 * Seamlessly integrates with Person 3's Dynamic Tariff Agent and Financial Ledger.
 */

import { CedarPolicyEngine, PolicyContext } from "./policy";
import { SolNetLedger } from "./ledger";
import { DynamicTariffQuote } from "../agent/tariffAgent";

export interface NodeState {
  id: string;
  solarKw: number;
  loadKw: number;
  batterySoc: number;
  batteryCapacityKwh: number;
  hasSolar?: boolean;
}

export interface TransferEvent {
  tradeId: string;
  from: string;
  to: string;
  kw: number;
  unitPriceInr?: number;
  totalInr?: number;
  timestamp: number;
  policyReason: string;
  cedarTrace: string;
}

export interface RoutingResult {
  transfers: TransferEvent[];
  gridImports: number;
  gridExports: number;
  curtailedKw: number;
  totalP2pKwh: number;
}

export class EnergyRouter {
  public static routeTick(
    nodes: NodeState[],
    feederVoltage: number,
    transformerMaxKw: number = 50.0,
    tariffQuote?: DynamicTariffQuote,
    ledger?: SolNetLedger
  ): RoutingResult {
    let currentTransformerLoad = 0;
    const transfers: TransferEvent[] = [];
    let totalGridExport = 0;
    let totalGridImport = 0;
    let curtailedKw = 0;

    const surplusNodes: { node: NodeState; excessKw: number }[] = [];
    const deficitNodes: { node: NodeState; neededKw: number }[] = [];

    // Step 1: Self-Consumption and Step 2: Self-Storage Charging
    for (const node of nodes) {
      const net = node.solarKw - node.loadKw;
      if (net > 0) {
        let remainingExcess = net;
        // Self-storage charging
        if (node.batteryCapacityKwh > 0 && node.batterySoc < 95.0) {
          const maxChargeKw = 3.0;
          const chargeKw = Math.min(remainingExcess, maxChargeKw);
          // 15-minute tick = 0.25h
          node.batterySoc = Math.min(
            100,
            Number((node.batterySoc + (chargeKw * 0.25 / node.batteryCapacityKwh) * 100).toFixed(1))
          );
          remainingExcess -= chargeKw;
        }
        if (remainingExcess > 0) {
          surplusNodes.push({ node, excessKw: remainingExcess });
        }
      } else {
        deficitNodes.push({ node, neededKw: Math.abs(net) });
      }
    }

    // Step 3: P2P Neighbor Routing
    let tradeCounter = 1;
    for (const seller of surplusNodes) {
      if (seller.excessKw <= 0) continue;

      for (const buyer of deficitNodes) {
        if (buyer.neededKw <= 0 || seller.excessKw <= 0) continue;

        const tradeKw = Math.min(seller.excessKw, buyer.neededKw);
        // Micro-trade filter
        if (tradeKw < 0.05) continue;

        const context: PolicyContext = {
          feederVoltage,
          transformerLoadKw: currentTransformerLoad,
          transformerMaxKw,
          sourceBatterySoc: seller.node.batterySoc,
          targetBatterySoc: buyer.node.batterySoc,
          isGridDown: false
        };

        const decision = CedarPolicyEngine.evaluateP2PTransfer(
          seller.node.id,
          buyer.node.id,
          tradeKw,
          context
        );

        if (decision.allowed) {
          seller.excessKw -= tradeKw;
          buyer.neededKw -= tradeKw;
          currentTransformerLoad += tradeKw;

          const tradeId = `TRD_${Date.now()}_${tradeCounter++}`;
          const unitPrice = tariffQuote ? tariffQuote.unitPriceInr : 5.50;
          const totalInr = Number((tradeKw * 0.25 * unitPrice).toFixed(2));

          const transfer: TransferEvent = {
            tradeId,
            from: seller.node.id,
            to: buyer.node.id,
            kw: Number(tradeKw.toFixed(2)),
            unitPriceInr: unitPrice,
            totalInr,
            timestamp: Date.now(),
            policyReason: decision.reason,
            cedarTrace: decision.cedarTrace
          };

          transfers.push(transfer);

          // Update Financial Ledger if passed
          if (ledger && tariffQuote) {
            ledger.recordTrade(
              {
                tradeId,
                sellerId: seller.node.id,
                buyerId: buyer.node.id,
                kWhApproved: Number((tradeKw * 0.25).toFixed(3)),
                timestamp: new Date().toISOString()
              },
              tariffQuote,
              decision.cedarTrace
            );
          }
        }
      }

      // Step 4 & 5: Grid Export or Curtailment
      if (seller.excessKw > 0) {
        if (feederVoltage >= 253.0) {
          // Statutory limit exceeded: curtail to prevent tripping/fire
          curtailedKw += seller.excessKw;
        } else {
          totalGridExport += seller.excessKw;
        }
      }
    }

    // Unmet demand becomes Grid Import
    for (const buyer of deficitNodes) {
      if (buyer.neededKw > 0) {
        totalGridImport += buyer.neededKw;
      }
    }

    const totalP2pKwh = Number(
      transfers.reduce((acc, t) => acc + t.kw * 0.25, 0).toFixed(2)
    );

    return {
      transfers,
      gridImports: Number(totalGridImport.toFixed(2)),
      gridExports: Number(totalGridExport.toFixed(2)),
      curtailedKw: Number(curtailedKw.toFixed(2)),
      totalP2pKwh
    };
  }
}
