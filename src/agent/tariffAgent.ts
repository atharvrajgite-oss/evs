/**
 * SolNet AI - Person 3: Dynamic Tariff Agent
 *
 * Implements:
 * 1. Neighborhood Scarcity Index calculation driven by multi-horizon ML forecasts.
 * 2. Dynamic P2P Tariff Pricing bounded between Grid Feed-in Floor (₹3.00)
 *    and Grid Retail Ceiling (₹8.50).
 * 3. Grid Carbon Intensity Signal integration (promoting green energy routing).
 * 4. Win-Win Prosumer Margin & Consumer Savings calculation.
 */

import { NeighborhoodForecast } from '../ml/forecaster';

// ==========================================
// 1. DATA CONTRACTS & CONFIGURATION
// ==========================================

export interface TariffConfig {
  gridFeedInFloorInr: number;    // e.g. ₹3.00 / kWh (DISCOM solar export buyback rate)
  gridRetailCeilingInr: number;  // e.g. ₹8.50 / kWh (DISCOM retail domestic electricity rate)
  baseGridCarbonIntensityGco2: number; // e.g. 720 g CO2 / kWh (Standard coal grid benchmark)
  platformFeePct: number;        // e.g. 0.02 (2% microgrid routing fee, or 0.0 for pure P2P)
}

export interface DynamicTariffQuote {
  timestamp: string;
  scarcityIndex: number;         // 0.0 (super abundant solar) to 1.0 (extreme deficit)
  unitPriceInr: number;          // Cleared P2P unit price per kWh
  floorPriceInr: number;         // Grid feed-in floor (₹)
  ceilingPriceInr: number;       // Grid retail ceiling (₹)
  sellerPremiumPct: number;      // % extra seller earns compared to dumping to grid
  buyerDiscountPct: number;      // % discount buyer gets compared to buying from grid
  gridCo2IntensityGco2: number;  // Current grid carbon intensity (g CO2 / kWh)
  co2OffsetFactorGco2: number;   // Grams of CO2 avoided per kWh of solar routed
  pricingRegime: 'ABUNDANCE_EV_ABSORB' | 'BALANCED_P2P' | 'HIGH_SCARCITY_RESERVE';
  rationale: string;
}

export const DEFAULT_TARIFF_CONFIG: TariffConfig = {
  gridFeedInFloorInr: 3.00,
  gridRetailCeilingInr: 8.50,
  baseGridCarbonIntensityGco2: 720,
  platformFeePct: 0.0,
};

// ==========================================
// 2. DYNAMIC TARIFF AGENT CLASS
// ==========================================

export class SolNetTariffAgent {
  private config: TariffConfig;

  constructor(config: Partial<TariffConfig> = {}) {
    this.config = { ...DEFAULT_TARIFF_CONFIG, ...config };
  }

  /**
   * Calculates dynamic P2P tariff based on real-time ML forecast and environmental factors.
   */
  public calculateTariff(
    forecast: NeighborhoodForecast,
    gridCo2IntensityOverride?: number
  ): DynamicTariffQuote {
    const { gridFeedInFloorInr, gridRetailCeilingInr, baseGridCarbonIntensityGco2 } = this.config;
    const spread = gridRetailCeilingInr - gridFeedInFloorInr; // e.g. ₹8.50 - ₹3.00 = ₹5.50

    // 1. Compute composite Scarcity Index from multi-horizon forecast
    // We weight near-term (15m, 30m) heavily (60%) and 1h-4h forward lookahead (40%)
    const weights = [0.35, 0.25, 0.20, 0.10, 0.10];
    let compositeScarcity = 0;
    for (let i = 0; i < forecast.horizons.length; i++) {
      compositeScarcity += forecast.horizons[i].scarcityFactor * (weights[i] || 0.1);
    }
    compositeScarcity = Math.max(0.05, Math.min(0.95, Number(compositeScarcity.toFixed(3))));

    // 2. Grid Carbon Intensity adjustment
    // Standard coal grid ~720 g CO2/kWh; during high grid intensity, incentivize maximum P2P solar
    const currentGridCo2 = gridCo2IntensityOverride ?? baseGridCarbonIntensityGco2;
    const co2OffsetPerKwh = currentGridCo2; // Each kWh of local solar replaces 1 kWh of grid coal

    // 3. Dynamic Tariff curve: sigmoid-like response
    // Low scarcity (high surplus) -> approaches Floor (e.g. ₹3.60)
    // High scarcity -> approaches Ceiling (e.g. ₹7.80)
    let dynamicPrice = gridFeedInFloorInr + spread * Math.pow(compositeScarcity, 0.85);

    // Minor discount if solar is super abundant to force EV charging absorption
    if (compositeScarcity < 0.2) {
      dynamicPrice = Math.max(gridFeedInFloorInr + 0.50, dynamicPrice * 0.95);
    }

    dynamicPrice = Number(Math.max(gridFeedInFloorInr, Math.min(gridRetailCeilingInr, dynamicPrice)).toFixed(2));

    // 4. Calculate Economic Benefits
    // Seller extra earning vs grid feed-in tariff (₹3.00)
    const sellerPremiumPct = Number(
      (((dynamicPrice - gridFeedInFloorInr) / gridFeedInFloorInr) * 100).toFixed(1)
    );
    // Buyer discount vs grid retail price (₹8.50)
    const buyerDiscountPct = Number(
      (((gridRetailCeilingInr - dynamicPrice) / gridRetailCeilingInr) * 100).toFixed(1)
    );

    // 5. Determine Pricing Regime & Rationale
    let pricingRegime: DynamicTariffQuote['pricingRegime'];
    let rationale: string;

    if (compositeScarcity < 0.3) {
      pricingRegime = 'ABUNDANCE_EV_ABSORB';
      rationale = `Solar abundance detected (Surplus: +${forecast.currentNetSurplusKw} kW). P2P rate set low at ₹${dynamicPrice}/kWh to drive neighbor EV charging and storage buffering.`;
    } else if (compositeScarcity > 0.7) {
      pricingRegime = 'HIGH_SCARCITY_RESERVE';
      rationale = `Solar scarcity detected (Cloud cover or sunset transition). P2P rate elevated to ₹${dynamicPrice}/kWh to reward battery discharge to critical neighbor loads.`;
    } else {
      pricingRegime = 'BALANCED_P2P';
      rationale = `Balanced neighborhood generation vs load. Fair clearing rate at ₹${dynamicPrice}/kWh (+${sellerPremiumPct}% seller premium, -${buyerDiscountPct}% buyer discount).`;
    }

    return {
      timestamp: forecast.forecastTimestamp,
      scarcityIndex: compositeScarcity,
      unitPriceInr: dynamicPrice,
      floorPriceInr: gridFeedInFloorInr,
      ceilingPriceInr: gridRetailCeilingInr,
      sellerPremiumPct,
      buyerDiscountPct,
      gridCo2IntensityGco2: currentGridCo2,
      co2OffsetFactorGco2: co2OffsetPerKwh,
      pricingRegime,
      rationale,
    };
  }

  /**
   * Update configuration dynamically if needed (e.g. for different utility zones).
   */
  public updateConfig(newConfig: Partial<TariffConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): TariffConfig {
    return { ...this.config };
  }
}
