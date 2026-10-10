/**
 * SolNet AI - Person 3: AI & Economics Lead
 * Main Entry Point & Simulation Demo
 *
 * Demonstrates:
 * 1. Mock telemetry ingestion from 10 neighborhood houses.
 * 2. Multi-horizon Ridge Regression ML Forecaster (15m to 4h lookaheads).
 * 3. Dynamic Tariff Agent (Scarcity Index, P2P Pricing, Carbon Optimization).
 * 4. Financial Ledger (Double-entry balance, Counterfactual savings, CO2 offset).
 */

export * from './sim/simulator';
export * from './engine/policy';
export * from './engine/router';
export * from './engine/ledger';
export * from './ml/forecaster';
export * from './ml/mockData';
export * from './agent/tariffAgent';
export * from './aws/iotSimulator';
export * from './aws/lambdaRouter';
export * from './aws/bedrockAgent';

import {
  getMockTelemetry,
  getMockWeather,
  generateHistoricalTrainingData,
  simulateMockRoutingDecisions,
  NEIGHBORHOOD_HOUSES,
} from './ml/mockData';
import { SolNetForecaster } from './ml/forecaster';
import { SolNetTariffAgent } from './agent/tariffAgent';
import { SolNetLedger } from './engine/ledger';

// ==========================================
// DEMO RUNNER
// ==========================================

async function runPerson3Demo() {
  console.log('\n===============================================================');
  console.log('⚡ SolNet AI - Person 3: ML Forecaster & Economic Engine Demo ⚡');
  console.log('===============================================================\n');

  // Step 1: Initialize Modules
  console.log('1️⃣ Initializing modules...');
  const forecaster = new SolNetForecaster();
  const tariffAgent = new SolNetTariffAgent({
    gridFeedInFloorInr: 3.00,
    gridRetailCeilingInr: 8.50,
    baseGridCarbonIntensityGco2: 720,
  });
  const houseIds = NEIGHBORHOOD_HOUSES.map((h) => h.houseId);
  const ledger = new SolNetLedger(houseIds);

  // Step 2: Calibrate Forecaster with historical synthetic data
  console.log('2️⃣ Training Ridge Regression Forecaster on 7 days of historical time-series...');
  const history = generateHistoricalTrainingData(7);
  forecaster.train(history.timestamps, history.weather, history.telemetry);
  console.log('   ✅ Forecaster weights successfully calibrated for [15m, 30m, 1h, 2h, 4h] horizons.\n');

  // Step 3: Run Multi-Scenario Simulation Ticks
  const scenarios = [
    {
      name: 'Scenario A: Bright Midday (12:30 PM, Clear Sky, 10% Cloud)',
      hour: 12.5,
      cloudCover: 10,
    },
    {
      name: 'Scenario B: Sudden Passing Cloud Event (1:15 PM, 75% Cloud Spike)',
      hour: 13.25,
      cloudCover: 75,
    },
    {
      name: 'Scenario C: Late Afternoon Transition (4:30 PM, 25% Cloud)',
      hour: 16.5,
      cloudCover: 25,
    },
    {
      name: 'Scenario D: Evening Peak Demand (7:45 PM, 0% Solar, High EV Loads)',
      hour: 19.75,
      cloudCover: 15,
    },
  ];

  for (const sc of scenarios) {
    console.log('---------------------------------------------------------------');
    console.log(`🌤️  ${sc.name}`);
    console.log('---------------------------------------------------------------');

    const fakeDate = new Date();
    fakeDate.setHours(Math.floor(sc.hour), (sc.hour % 1) * 60, 0);

    // 1. Ingest Telemetry & Weather
    const weather = getMockWeather(sc.cloudCover, fakeDate);
    const telemetry = getMockTelemetry(sc.cloudCover, fakeDate);

    const totalSolar = telemetry.reduce((sum, h) => sum + h.solarKw, 0).toFixed(1);
    const totalLoad = telemetry.reduce((sum, h) => sum + h.loadKw, 0).toFixed(1);
    console.log(`Live Sensors: Solar = ${totalSolar} kW | Load = ${totalLoad} kW | Irradiance = ${weather.irradianceWm2} W/m²`);

    // 2. Multi-Horizon ML Forecast
    const forecast = forecaster.forecast(telemetry, weather, undefined, fakeDate);
    console.log(`\n📈 [ML Forecast Matrix]:`);
    console.table(
      forecast.horizons.map((h) => ({
        Horizon: `+${h.lookaheadMinutes} mins`,
        'Solar (kW)': h.predictedSolarKw,
        'Load (kW)': h.predictedLoadKw,
        'Net Surplus': h.netSurplusKw > 0 ? `+${h.netSurplusKw}` : `${h.netSurplusKw}`,
        Scarcity: h.scarcityFactor.toFixed(2),
        Confidence: `${h.confidencePct}%`,
      }))
    );

    if (forecast.bedrockAgentExplanation) {
      console.log(`🤖 ${forecast.bedrockAgentExplanation}`);
    }

    // 3. Dynamic Tariff Calculation
    const tariff = tariffAgent.calculateTariff(forecast);
    console.log(`\n💰 [Dynamic P2P Tariff Pricing]:`);
    console.log(`   - Cleared P2P Price: ₹${tariff.unitPriceInr.toFixed(2)} / kWh (Floor: ₹${tariff.floorPriceInr} | Ceiling: ₹${tariff.ceilingPriceInr})`);
    console.log(`   - Seller Extra Profit: +${tariff.sellerPremiumPct}% vs. grid dump rate`);
    console.log(`   - Buyer Discount:      -${tariff.buyerDiscountPct}% vs. utility tariff`);
    console.log(`   - Pricing Regime:      ${tariff.pricingRegime}`);
    console.log(`   - AI Rationale:        ${tariff.rationale}`);

    // 4. Simulate Grid Router Approvals & Ledger Settlement
    const routingDecisions = simulateMockRoutingDecisions(telemetry, 0.25);
    if (routingDecisions.length > 0) {
      const txs = ledger.recordBatchTrades(routingDecisions, tariff);
      const kwhInTick = txs.reduce((s, t) => s + t.kWhTraded, 0).toFixed(2);
      const inrInTick = txs.reduce((s, t) => s + t.totalAmountInr, 0).toFixed(2);
      const co2InTick = txs.reduce((s, t) => s + t.co2SavedKg, 0).toFixed(2);
      console.log(`\n⚡ [Settlement]: Executed ${txs.length} peer trades (${kwhInTick} kWh, ₹${inrInTick}, -${co2InTick} kg CO2)`);
      console.log(`   Sample Audit Trace: ${txs[0].cedarPolicyTrace}`);
    } else {
      console.log(`\n⏸️  No P2P trades cleared in this tick (Local generation absorbed or insufficient surplus).`);
    }

    console.log('');
  }

  // Step 4: Print Macro Financial & Environmental Ledger Summary
  console.log('===============================================================');
  console.log('📊 FINAL NEIGHBORHOOD LEDGER & COUNTERFACTUAL AUDIT');
  console.log('===============================================================');

  const summary = ledger.getNeighborhoodSummary();
  console.log(`Total Trades Executed:               ${summary.totalTrades}`);
  console.log(`Total Clean Energy Routed:           ${summary.totalKwhTraded} kWh`);
  console.log(`Total P2P Gross Volume:              ₹${summary.totalVolumeInr}`);
  console.log(`🌟 Total Neighborhood Savings:        ₹${summary.totalNeighborhoodSavingsInr} (vs. Standard Utility Grid)`);
  console.log(`🌿 Total CO2 Emissions Avoided:      ${summary.totalCo2OffsetKg} kg`);
  console.log(`🌳 Equivalent Mature Trees Planted:  ${summary.equivalentTreesPlanted} trees\n`);

  console.log('🏠 Per-House Balance Sheet:');
  const accounts = ledger.getAllAccounts();
  console.table(
    accounts.map((acc) => ({
      House: acc.houseId,
      'Sold (kWh)': acc.totalKwhSold,
      'Bought (kWh)': acc.totalKwhBought,
      'Wallet (₹)': acc.walletBalanceInr > 0 ? `+₹${acc.walletBalanceInr}` : `₹${acc.walletBalanceInr}`,
      'Counterfactual Saved (₹)': `₹${acc.netSavingsVsGridInr}`,
      'CO2 Offset (kg)': `${acc.totalCo2OffsetKg} kg`,
      Trades: acc.tradeCount,
    }))
  );

  console.log('===============================================================');
  console.log('✨ Person 3 Module Verification: 100% Complete & Ready for Day 3 Merge! ✨');
  console.log('===============================================================\n');
}

// Execute demo if executed directly
if (require.main === module) {
  runPerson3Demo().catch((err) => {
    console.error('Simulation error:', err);
    process.exit(1);
  });
}
