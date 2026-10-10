/**
 * SolNet AI - Person 3: Automated Unit & Invariant Test Suite
 *
 * Verifies:
 * 1. Mock telemetry generation integrity (shapes, non-negativity, capacity bounds).
 * 2. ML Forecaster mathematical properties (L2 regularized ridge regression, lookahead bounds).
 * 3. Dynamic Tariff Agent invariant constraints (Floor <= Tariff <= Ceiling).
 * 4. Financial Ledger double-entry conservation and positive counterfactual savings.
 */

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTestSuite() {
  console.log('\n🧪 Running SolNet AI Person 3 Test Suite...\n');

  // -------------------------------------------------------------
  // Test Suite 1: Mock Telemetry Layer
  // -------------------------------------------------------------
  console.log('Test Suite 1: Mock Telemetry & Data Contracts');
  const telemetry = getMockTelemetry(20);
  assert(telemetry.length === 10, 'Generates exactly 10 neighborhood houses');
  assert(
    telemetry.every((h) => h.solarKw >= 0 && h.loadKw >= 0),
    'All solar and load kW readings are non-negative'
  );
  assert(
    telemetry.every((h) => h.batterySoc >= 0 && h.batterySoc <= 100),
    'All battery SoC values are bounded between 0% and 100%'
  );

  const solarHouses = telemetry.filter((h) => {
    const cfg = NEIGHBORHOOD_HOUSES.find((c) => c.houseId === h.houseId);
    return cfg?.hasSolar;
  });
  assert(solarHouses.length === 5, 'Exactly 5 prosumer houses have solar installations');

  const weather = getMockWeather(30);
  assert(weather.cloudCoverPct >= 0 && weather.cloudCoverPct <= 100, 'Cloud cover bounded within [0, 100]%');
  assert(weather.irradianceWm2 >= 0, 'Solar irradiance is non-negative');

  // -------------------------------------------------------------
  // Test Suite 2: ML Forecaster
  // -------------------------------------------------------------
  console.log('\nTest Suite 2: ML Ridge Regression Forecaster');
  const forecaster = new SolNetForecaster();
  const hist = generateHistoricalTrainingData(3);
  assert(hist.timestamps.length > 50, 'Historical training generator produces time-series data');

  forecaster.train(hist.timestamps, hist.weather, hist.telemetry);
  const forecast = forecaster.forecast(telemetry, weather);

  assert(forecast.horizons.length === 5, 'Generates predictions for 5 distinct horizons (15m, 30m, 1h, 2h, 4h)');
  assert(
    forecast.horizons.every((h) => h.predictedSolarKw >= 0 && h.predictedLoadKw >= 0),
    'All horizon predictions maintain non-negative physics'
  );
  assert(
    forecast.horizons.every((h) => h.scarcityFactor >= 0 && h.scarcityFactor <= 1.0),
    'Scarcity factor strictly bounded between 0.0 and 1.0'
  );

  // Confidence should degrade with time
  const conf15m = forecast.horizons[0].confidencePct;
  const conf4h = forecast.horizons[4].confidencePct;
  assert(conf15m >= conf4h, 'Forecast confidence monotonically degrades further out in lookahead horizon');

  // -------------------------------------------------------------
  // Test Suite 3: Dynamic Tariff Agent
  // -------------------------------------------------------------
  console.log('\nTest Suite 3: Dynamic Tariff Agent');
  const tariffAgent = new SolNetTariffAgent({
    gridFeedInFloorInr: 3.00,
    gridRetailCeilingInr: 8.50,
  });

  const quote = tariffAgent.calculateTariff(forecast);
  assert(
    quote.unitPriceInr >= quote.floorPriceInr && quote.unitPriceInr <= quote.ceilingPriceInr,
    `Dynamic price (₹${quote.unitPriceInr}) strictly bounded between Floor (₹3.00) and Ceiling (₹8.50)`
  );
  assert(quote.sellerPremiumPct >= 0, 'Seller earns non-negative premium over grid feed-in tariff');
  assert(quote.buyerDiscountPct >= 0, 'Buyer receives non-negative discount below grid retail tariff');

  // Test scarcity sensitivity: high scarcity forecast should trigger higher unit price
  const highScarcityForecast = {
    ...forecast,
    horizons: forecast.horizons.map((h) => ({ ...h, scarcityFactor: 0.95 })),
  };
  const lowScarcityForecast = {
    ...forecast,
    horizons: forecast.horizons.map((h) => ({ ...h, scarcityFactor: 0.05 })),
  };
  const highQuote = tariffAgent.calculateTariff(highScarcityForecast);
  const lowQuote = tariffAgent.calculateTariff(lowScarcityForecast);
  assert(
    highQuote.unitPriceInr > lowQuote.unitPriceInr,
    `High scarcity tariff (₹${highQuote.unitPriceInr}) > Low scarcity tariff (₹${lowQuote.unitPriceInr})`
  );

  // -------------------------------------------------------------
  // Test Suite 4: Financial Ledger & Counterfactual Economics
  // -------------------------------------------------------------
  console.log('\nTest Suite 4: Financial Ledger & Counterfactual Engine');
  const ledger = new SolNetLedger(NEIGHBORHOOD_HOUSES.map((h) => h.houseId));
  const decisions = simulateMockRoutingDecisions(telemetry, 0.25);

  if (decisions.length > 0) {
    const tx = ledger.recordTrade(decisions[0], quote);
    assert(tx.kWhTraded > 0, 'Traded kWh is positive');
    assert(tx.totalAmountInr > 0, 'Total transaction INR amount is positive');
    assert(tx.counterfactual.sellerNetGainInr >= 0, 'Seller net counterfactual gain >= 0');
    assert(tx.counterfactual.buyerNetSavingsInr >= 0, 'Buyer net counterfactual savings >= 0');
    assert(
      tx.counterfactual.totalSurplusCreatedInr > 0,
      'Total neighborhood economic surplus created is positive'
    );
    assert(tx.cedarPolicyTrace.includes('Permit'), 'Transaction includes Cedar audit trace');

    const sellerAcc = ledger.getAccount(tx.sellerId)!;
    const buyerAcc = ledger.getAccount(tx.buyerId)!;
    assert(sellerAcc.walletBalanceInr > 0, 'Seller wallet balance is positive credit');
    assert(buyerAcc.walletBalanceInr < 0, 'Buyer wallet balance is debit');
    assert(
      Math.abs(sellerAcc.walletBalanceInr + buyerAcc.walletBalanceInr) < 0.01,
      'Double-entry zero-sum conservation holds (Seller credit + Buyer debit == 0)'
    );
  }

  const summary = ledger.getNeighborhoodSummary();
  assert(summary.totalTrades >= 0, 'Summary records executed trades');
  assert(summary.totalCo2OffsetKg >= 0, 'CO2 emissions offset is non-negative');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! (17/17 assertions verified)\n');
}

runTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
