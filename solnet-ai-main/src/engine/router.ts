import { CedarPolicyEngine, PolicyContext } from "./policy";

export interface NodeState {
  id: string;
  solarKw: number;
  loadKw: number;
  batterySoc: number;
  batteryCapacityKwh: number;
}

export interface TransferEvent {
  from: string;
  to: string;
  kw: number;
  timestamp: number;
  policyReason: string;
}

export class EnergyRouter {
  public static routeTick(
    nodes: NodeState[],
    feederVoltage: number,
    transformerMaxKw: number = 50.0
  ): { transfers: TransferEvent[]; gridImports: number; gridExports: number } {
    let currentTransformerLoad = 0;
    const transfers: TransferEvent[] = [];
    let totalGridExport = 0;
    let totalGridImport = 0;

    const surplusNodes: { node: NodeState; excessKw: number }[] = [];
    const deficitNodes: { node: NodeState; neededKw: number }[] = [];

    for (const node of nodes) {
      const net = node.solarKw - node.loadKw;
      if (net > 0) {
        let remainingExcess = net;
        if (node.batterySoc < 95.0) {
          const maxChargeKw = 3.0;
          const chargeKw = Math.min(remainingExcess, maxChargeKw);
          node.batterySoc += (chargeKw * 0.25 / node.batteryCapacityKwh) * 100;
          remainingExcess -= chargeKw;
        }
        if (remainingExcess > 0) {
          surplusNodes.push({ node, excessKw: remainingExcess });
        }
      } else {
        deficitNodes.push({ node, neededKw: Math.abs(net) });
      }
    }

    for (const seller of surplusNodes) {
      if (seller.excessKw <= 0) continue;

      for (const buyer of deficitNodes) {
        if (buyer.neededKw <= 0) continue;

const tradeKw = Math.min(seller.excessKw, buyer.neededKw);
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

          transfers.push({
            from: seller.node.id,
            to: buyer.node.id,
            kw: Number(tradeKw.toFixed(2)),
            timestamp: Date.now(),
            policyReason: decision.reason
          });
        }
      }

      if (seller.excessKw > 0) {
        totalGridExport += seller.excessKw;
      }
    }

    for (const buyer of deficitNodes) {
      if (buyer.neededKw > 0) {
        totalGridImport += buyer.neededKw;
      }
    }

    return {
      transfers,
      gridImports: Number(totalGridImport.toFixed(2)),
      gridExports: Number(totalGridExport.toFixed(2))
    };
  }
}