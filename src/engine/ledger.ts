/**
 * SolNet AI - Person 3: Financial Ledger & Counterfactual Engine
 *
 * Implements:
 * 1. Double-entry microgrid accounting recording kWh_traded × dynamic_tariff.
 * 2. Per-house credit/debit balances, gross volume, and wallet tracking.
 * 3. Counterfactual Economic Engine: "Household Savings vs. No Microgrid".
 *    - Proves exact financial gains for solar owners and non-solar buyers.
 * 4. Carbon avoidance ledger (total kg CO2 offset and tree equivalency).
 * 5. Cedar Policy Traceability auditing per transaction.
 */

import { RoutingDecision } from '../ml/mockData.js';
import { DynamicTariffQuote } from '../agent/tariffAgent.js';

// ==========================================
// 1. DATA CONTRACTS
// ==========================================

export interface CounterfactualMetrics {
  sellerGridEarningsInr: number;    // What seller would earn dumping to grid at ₹3.00/kWh
  buyerGridCostInr: number;         // What buyer would pay utility at ₹8.50/kWh
  sellerNetGainInr: number;         // Extra profit earned through SolNet P2P
  buyerNetSavingsInr: number;       // Discount saved compared to utility bill
  totalSurplusCreatedInr: number;   // Combined community economic surplus
}

export interface EnergyTransaction {
  tradeId: string;
  timestamp: string;
  sellerId: string;
  buyerId: string;
  kWhTraded: number;
  unitPriceInr: number;
  totalAmountInr: number;
  co2SavedKg: number;
  counterfactual: CounterfactualMetrics;
  cedarPolicyTrace: string;
}

export interface HouseAccountSummary {
  houseId: string;
  walletBalanceInr: number;       // Positive = net profit; Negative = net electricity cost
  totalKwhSold: number;
  totalKwhBought: number;
  totalEarningsInr: number;
  totalSpendInr: number;
  netSavingsVsGridInr: number;    // Counterfactual savings realized
  totalCo2OffsetKg: number;
  tradeCount: number;
}

export interface NeighborhoodLedgerSummary {
  totalTrades: number;
  totalKwhTraded: number;
  totalVolumeInr: number;
  totalNeighborhoodSavingsInr: number;
  totalCo2OffsetKg: number;
  equivalentTreesPlanted: number;
  topSellerHouseId: string;
  topBuyerHouseId: string;
}

// ==========================================
// 2. FINANCIAL LEDGER CLASS
// ==========================================

export class SolNetLedger {
  private transactions: EnergyTransaction[] = [];
  private accounts: Map<string, HouseAccountSummary> = new Map();

  constructor(initialHouseIds: string[] = []) {
    for (const houseId of initialHouseIds) {
      this.getOrCreateAccount(houseId);
    }
  }

  private getOrCreateAccount(houseId: string): HouseAccountSummary {
    if (!this.accounts.has(houseId)) {
      this.accounts.set(houseId, {
        houseId,
        walletBalanceInr: 0,
        totalKwhSold: 0,
        totalKwhBought: 0,
        totalEarningsInr: 0,
        totalSpendInr: 0,
        netSavingsVsGridInr: 0,
        totalCo2OffsetKg: 0,
        tradeCount: 0,
      });
    }
    return this.accounts.get(houseId)!;
  }

  /**
   * Records an approved routing decision from Person 2's Router,
   * priced by Person 3's Dynamic Tariff Agent.
   */
  public recordTrade(
    decision: RoutingDecision,
    tariffQuote: DynamicTariffQuote,
    cedarPolicyTraceOverride?: string
  ): EnergyTransaction {
    const { kWhApproved, sellerId, buyerId, tradeId } = decision;
    const unitPrice = tariffQuote.unitPriceInr;
    const totalAmount = Number((kWhApproved * unitPrice).toFixed(2));

    // CO2 saved in kilograms: (kWh * gCO2/kWh) / 1000
    const co2SavedKg = Number(
      ((kWhApproved * tariffQuote.co2OffsetFactorGco2) / 1000).toFixed(3)
    );

    // 1. Counterfactual Baseline Calculations ("Without Microgrid")
    // If no P2P existed:
    // - Seller would export to grid at floor rate (₹3.00/kWh)
    const sellerBaselineEarnings = Number((kWhApproved * tariffQuote.floorPriceInr).toFixed(2));
    // - Buyer would import from grid at ceiling rate (₹8.50/kWh)
    const buyerBaselineCost = Number((kWhApproved * tariffQuote.ceilingPriceInr).toFixed(2));

    const sellerNetGain = Number((totalAmount - sellerBaselineEarnings).toFixed(2));
    const buyerNetSavings = Number((buyerBaselineCost - totalAmount).toFixed(2));
    const totalSurplus = Number((sellerNetGain + buyerNetSavings).toFixed(2));

    // 2. Cedar Policy Audit Trace
    const cedarTrace =
      cedarPolicyTraceOverride ||
      `Permit(principal: User::"${sellerId}", action: Action::"P2P_Route", resource: Feeder::"Local_Phase") ` +
      `when { batterySoc >= 30% && feeder_voltage < 253.0V && price == ₹${unitPrice} }`;

    const tx: EnergyTransaction = {
      tradeId,
      timestamp: decision.timestamp || new Date().toISOString(),
      sellerId,
      buyerId,
      kWhTraded: kWhApproved,
      unitPriceInr: unitPrice,
      totalAmountInr: totalAmount,
      co2SavedKg,
      counterfactual: {
        sellerGridEarningsInr: sellerBaselineEarnings,
        buyerGridCostInr: buyerBaselineCost,
        sellerNetGainInr: sellerNetGain,
        buyerNetSavingsInr: buyerNetSavings,
        totalSurplusCreatedInr: totalSurplus,
      },
      cedarPolicyTrace: cedarTrace,
    };

    // 3. Update Seller Account
    const sellerAccount = this.getOrCreateAccount(sellerId);
    sellerAccount.walletBalanceInr = Number((sellerAccount.walletBalanceInr + totalAmount).toFixed(2));
    sellerAccount.totalKwhSold = Number((sellerAccount.totalKwhSold + kWhApproved).toFixed(2));
    sellerAccount.totalEarningsInr = Number((sellerAccount.totalEarningsInr + totalAmount).toFixed(2));
    sellerAccount.netSavingsVsGridInr = Number((sellerAccount.netSavingsVsGridInr + sellerNetGain).toFixed(2));
    sellerAccount.totalCo2OffsetKg = Number((sellerAccount.totalCo2OffsetKg + co2SavedKg).toFixed(3));
    sellerAccount.tradeCount += 1;

    // 4. Update Buyer Account
    const buyerAccount = this.getOrCreateAccount(buyerId);
    buyerAccount.walletBalanceInr = Number((buyerAccount.walletBalanceInr - totalAmount).toFixed(2));
    buyerAccount.totalKwhBought = Number((buyerAccount.totalKwhBought + kWhApproved).toFixed(2));
    buyerAccount.totalSpendInr = Number((buyerAccount.totalSpendInr + totalAmount).toFixed(2));
    buyerAccount.netSavingsVsGridInr = Number((buyerAccount.netSavingsVsGridInr + buyerNetSavings).toFixed(2));
    buyerAccount.tradeCount += 1;

    this.transactions.push(tx);
    return tx;
  }

  /**
   * Batch records an array of routing decisions for a single simulation tick.
   */
  public recordBatchTrades(
    decisions: RoutingDecision[],
    tariffQuote: DynamicTariffQuote
  ): EnergyTransaction[] {
    return decisions.map((d) => this.recordTrade(d, tariffQuote));
  }

  /**
   * Returns individual account summary for a specific house.
   */
  public getAccount(houseId: string): HouseAccountSummary | undefined {
    return this.accounts.get(houseId);
  }

  /**
   * Returns list of all house accounts.
   */
  public getAllAccounts(): HouseAccountSummary[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Returns recent transactions.
   */
  public getTransactions(limit: number = 50): EnergyTransaction[] {
    return this.transactions.slice(-limit);
  }

  /**
   * Generates the macro neighborhood-level financial & environmental audit.
   */
  public getNeighborhoodSummary(): NeighborhoodLedgerSummary {
    let totalKwhTraded = 0;
    let totalVolumeInr = 0;
    let totalSavingsInr = 0;
    let totalCo2OffsetKg = 0;

    let maxSold = -1;
    let topSeller = 'None';
    let maxBought = -1;
    let topBuyer = 'None';

    for (const acc of this.accounts.values()) {
      totalSavingsInr += acc.netSavingsVsGridInr;
      if (acc.totalKwhSold > maxSold) {
        maxSold = acc.totalKwhSold;
        topSeller = acc.houseId;
      }
      if (acc.totalKwhBought > maxBought) {
        maxBought = acc.totalKwhBought;
        topBuyer = acc.houseId;
      }
    }

    for (const tx of this.transactions) {
      totalKwhTraded += tx.kWhTraded;
      totalVolumeInr += tx.totalAmountInr;
      totalCo2OffsetKg += tx.co2SavedKg;
    }

    // 1 mature tree absorbs ~21.77 kg CO2 per year (~0.06 kg per day)
    const equivalentTreesPlanted = Number((totalCo2OffsetKg / 21.77).toFixed(2));

    return {
      totalTrades: this.transactions.length,
      totalKwhTraded: Number(totalKwhTraded.toFixed(2)),
      totalVolumeInr: Number(totalVolumeInr.toFixed(2)),
      totalNeighborhoodSavingsInr: Number(totalSavingsInr.toFixed(2)),
      totalCo2OffsetKg: Number(totalCo2OffsetKg.toFixed(2)),
      equivalentTreesPlanted,
      topSellerHouseId: topSeller,
      topBuyerHouseId: topBuyer,
    };
  }

  /**
   * Clears in-memory ledger state (useful for fresh benchmark runs).
   */
  public resetLedger(): void {
    this.transactions = [];
    this.accounts.clear();
  }
}
