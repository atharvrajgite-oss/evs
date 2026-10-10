export interface PolicyContext {
  feederVoltage: number;       // Nominal 230V (safe: 216V - 253V)
  transformerLoadKw: number;   // Current load on transformer
  transformerMaxKw: number;    // e.g. 50 kW rating
  sourceBatterySoc: number;    // 0 to 100%
  targetBatterySoc: number;    // 0 to 100%
  isGridDown: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  ruleMatched: string;
  reason: string;
}

export class CedarPolicyEngine {
  /**
   * Cedar-style Deny-by-Default evaluation engine.
   */
  public static evaluateP2PTransfer(
    sourceId: string,
    targetId: string,
    transferKw: number,
    context: PolicyContext
  ): PolicyDecision {
    // 1. FORBID: Grid Overvoltage Protection (+6% statutory limit: 253V)
    if (context.feederVoltage >= 253.0) {
      return {
        allowed: false,
        ruleMatched: "forbid_overvoltage_limit",
        reason: `Feeder voltage (${context.feederVoltage.toFixed(1)}V) exceeds statutory safety limit (253V). Transfer curtailed to prevent inverter trip.`
      };
    }

    // 2. FORBID: Local Feeder Transformer Overload
    if (context.transformerLoadKw + transferKw > context.transformerMaxKw) {
      return {
        allowed: false,
        ruleMatched: "forbid_transformer_overload",
        reason: `Substation transformer at ${( (context.transformerLoadKw / context.transformerMaxKw) * 100 ).toFixed(0)}% capacity. P2P flow blocked.`
      };
    }

    // 3. FORBID: Source Battery Self-Preservation (Reserve must be >= 25%)
    if (context.sourceBatterySoc < 25.0) {
      return {
        allowed: false,
        ruleMatched: "forbid_source_battery_critical",
        reason: `Source node battery (${context.sourceBatterySoc.toFixed(1)}%) is below household reserve threshold (25%). Discharge forbidden.`
      };
    }

    // 4. FORBID: Target Battery Overflow
    if (context.targetBatterySoc >= 98.0) {
      return {
        allowed: false,
        ruleMatched: "forbid_target_battery_overflow",
        reason: `Target battery is at full capacity (${context.targetBatterySoc.toFixed(1)}%).`
      };
    }

    // 5. PERMIT: Priority P2P Transfer Rule
    if (context.feederVoltage < 253.0 && context.transformerLoadKw < context.transformerMaxKw) {
      return {
        allowed: true,
        ruleMatched: "permit_p2p_neighborhood_exchange",
        reason: "Voltage within standard bandwidth (216V–253V) and transformer capacity available."
      };
    }

    // Default Deny
    return {
      allowed: false,
      ruleMatched: "default_deny",
      reason: "No explicit Cedar permit policy matched."
    };
  }
}