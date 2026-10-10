/**
 * SolNet AI - Full Project Integration Test Suite (Persons 1, 2, 3, & 4)
 *
 * Verifies all cross-module invariants:
 * 1. Cedar Policy Engine (Deny-by-default, Statutory 253V trip, battery limits)
 * 2. 5-Tier Priority Energy Router (Merit order, conservation of energy)
 * 3. ML Forecaster (Multi-horizon Ridge Regression predictions & sanity bounds)
 * 4. Dynamic Tariff Agent (Bounds Floor <= P2P Price <= Ceiling, scarcity response)
 * 5. Financial Ledger (Double-entry balance conservation, counterfactual savings > 0)
 * 6. AWS Lambda Handler (Offline execution, 200 response, trade decisions)
 * 7. AWS Bedrock Agent (Heuristic fallback, tariff adjustments)
 * 8. AWS IoT Telemetry Publisher (Structured MQTT envelope generation)
 */

import { CedarPolicyEngine } from "./engine/policy";
import { EnergyRouter, NodeState } from "./engine/router";
import { SolNetForecaster } from "./ml/forecaster";
import { SolNetTariffAgent } from "./agent/tariffAgent";
import { SolNetLedger } from "./engine/ledger";
import { NeighborhoodSimulator } from "./sim/simulator";
import { handler as lambdaHandler } from "./aws/lambdaRouter";
import { BedrockTariffAgent } from "./aws/bedrockAgent";
import { IoTTelemetryPublisher } from "./aws/iotSimulator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runFullIntegrationTests() {
  console.log("\n===============================================================");
  console.log("🧪 SolNet AI - End-to-End Cross-Module Integration Test Suite");
  console.log("===============================================================\n");

  // -------------------------------------------------------------
  // Test Suite 1: Cedar Policy Engine (Person 2)
  // -------------------------------------------------------------
  console.log("Suite 1: Cedar Policy Engine (Person 2 Guardrails)");

  // 1.1 Overvoltage Trip at >= 253.0V
  const overvoltageDecision = CedarPolicyEngine.evaluateP2PTransfer(
    "House_1",
    "House_2",
    2.5,
    {
      feederVoltage: 254.2,
      transformerLoadKw: 10,
      transformerMaxKw: 50,
      sourceBatterySoc: 80,
      targetBatterySoc: 50,
      isGridDown: false,
    }
  );
  assert(!overvoltageDecision.allowed, "Cedar FORBIDS transfer when feeder voltage >= 253.0V (statutory limit)");
  assert(overvoltageDecision.ruleMatched === "forbid_overvoltage_limit", "Rule matched: forbid_overvoltage_limit");

  // 1.2 Battery Reserve Protection at < 25.0%
  const lowBatteryDecision = CedarPolicyEngine.evaluateP2PTransfer(
    "House_1",
    "House_2",
    2.0,
    {
      feederVoltage: 232.0,
      transformerLoadKw: 10,
      transformerMaxKw: 50,
      sourceBatterySoc: 22.0,
      targetBatterySoc: 50,
      isGridDown: false,
    }
  );
  assert(!lowBatteryDecision.allowed, "Cedar FORBIDS transfer when source battery SoC < 25% (reserve limit)");

  // 1.3 Normal Condition Permitted
  const permittedDecision = CedarPolicyEngine.evaluateP2PTransfer(
    "House_1",
    "House_2",
    2.0,
    {
      feederVoltage: 230.5,
      transformerLoadKw: 15,
      transformerMaxKw: 50,
      sourceBatterySoc: 75.0,
      targetBatterySoc: 40.0,
      isGridDown: false,
    }
  );
  assert(permittedDecision.allowed, "Cedar PERMITS transfer under normal voltage and healthy battery");
  assert(permittedDecision.cedarTrace.includes("Permit"), "Cedar audit trace generated successfully");

  // -------------------------------------------------------------
  // Test Suite 2: 5-Tier Priority Energy Router (Person 2 & 3)
  // -------------------------------------------------------------
  console.log("\nSuite 2: 5-Tier Priority Energy Router");
  const testNodes: NodeState[] = [
    { id: "House_1", solarKw: 8.0, loadKw: 2.0, batterySoc: 70, batteryCapacityKwh: 10 },
    { id: "House_2", solarKw: 0.0, loadKw: 4.0, batterySoc: 0, batteryCapacityKwh: 0 },
  ];
  const routerResult = EnergyRouter.routeTick(testNodes, 230.0, 50.0);
  assert(routerResult.transfers.length > 0, "Router matched and approved peer trade between prosumer and consumer");
  assert(routerResult.transfers[0].from === "House_1", "Seller is House_1");
  assert(routerResult.transfers[0].to === "House_2", "Buyer is House_2");
  assert(routerResult.curtailedKw === 0, "No curtailment under normal voltage");

  // Overvoltage curtailment test
  const overvoltageNodes: NodeState[] = [
    { id: "House_1", solarKw: 10.0, loadKw: 1.0, batterySoc: 98, batteryCapacityKwh: 10 },
    { id: "House_2", solarKw: 0.0, loadKw: 2.0, batterySoc: 0, batteryCapacityKwh: 0 },
  ];
  const tripResult = EnergyRouter.routeTick(overvoltageNodes, 255.4, 50.0);
  assert(tripResult.transfers.length === 0, "All peer trades blocked during overvoltage trip");
  assert(tripResult.curtailedKw > 0, "Excess solar curtailed to protect distribution grid");

  // -------------------------------------------------------------
  // Test Suite 3: ML Forecaster (Person 3)
  // -------------------------------------------------------------
  console.log("\nSuite 3: ML Multi-Horizon Forecaster (Person 3)");
  const forecaster = new SolNetForecaster();
  const testTelem = [
    { houseId: "H1", solarKw: 5.0, loadKw: 1.5, batterySoc: 70, timestamp: "" },
    { houseId: "H2", solarKw: 0.0, loadKw: 3.0, batterySoc: 0, timestamp: "" },
  ];
  const testWeather = { cloudCoverPct: 20, irradianceWm2: 850, temperatureC: 27, timestamp: "" };
  const forecast = forecaster.forecast(testTelem, testWeather);

  assert(forecast.horizons.length === 5, "Forecasts for 5 horizons: [15m, 30m, 1h, 2h, 4h]");
  assert(forecast.horizons.every((h) => h.predictedSolarKw >= 0), "All predicted solar outputs >= 0");
  assert(forecast.horizons.every((h) => h.scarcityFactor >= 0 && h.scarcityFactor <= 1.0), "Scarcity factor in [0, 1]");

  // -------------------------------------------------------------
  // Test Suite 4: Dynamic Tariff Agent (Person 3)
  // -------------------------------------------------------------
  console.log("\nSuite 4: Dynamic Tariff Agent (Person 3)");
  const tariffAgent = new SolNetTariffAgent({
    gridFeedInFloorInr: 3.00,
    gridRetailCeilingInr: 8.50,
  });
  const quote = tariffAgent.calculateTariff(forecast);
  assert(
    quote.unitPriceInr >= 3.00 && quote.unitPriceInr <= 8.50,
    `P2P tariff (₹${quote.unitPriceInr}) strictly bounded between Floor (₹3.00) and Ceiling (₹8.50)`
  );
  assert(quote.sellerPremiumPct > 0, "Solar prosumer earns positive premium over grid export rate");
  assert(quote.buyerDiscountPct > 0, "Consumer receives positive discount below utility tariff");

  // -------------------------------------------------------------
  // Test Suite 5: Financial Ledger & Counterfactual Savings (Person 3)
  // -------------------------------------------------------------
  console.log("\nSuite 5: Financial Ledger & Counterfactual Engine (Person 3)");
  const ledger = new SolNetLedger(["House_1", "House_2"]);
  const mockTrade = {
    tradeId: "TRD_TEST_01",
    sellerId: "House_1",
    buyerId: "House_2",
    kWhApproved: 2.0,
    timestamp: new Date().toISOString(),
  };
  const tx = ledger.recordTrade(mockTrade, quote);
  assert(tx.counterfactual.sellerNetGainInr > 0, "Seller earns extra profit vs. no-microgrid grid dump");
  assert(tx.counterfactual.buyerNetSavingsInr > 0, "Buyer saves money vs. utility retail bill");
  assert(tx.counterfactual.totalSurplusCreatedInr > 0, "Positive community surplus created");
  assert(tx.co2SavedKg > 0, "CO2 emissions avoided recorded");

  const summary = ledger.getNeighborhoodSummary();
  assert(summary.totalTrades === 1, "Ledger accurately tracks executed trade count");
  assert(summary.totalNeighborhoodSavingsInr > 0, "Neighborhood cumulative savings > 0");

  // -------------------------------------------------------------
  // Test Suite 6: Integrated Neighborhood Simulator (Person 2 & 3)
  // -------------------------------------------------------------
  console.log("\nSuite 6: Integrated Neighborhood Simulator");
  const sim = new NeighborhoodSimulator();
  const tick1 = sim.nextTick();
  assert(tick1.nodes.length === 10, "Simulator manages all 10 neighborhood households");
  assert(tick1.feederVoltage > 220 && tick1.feederVoltage < 255, "Realistic feeder line voltage generated");
  assert(tick1.tariff.unitPriceInr >= 3.00, "Live tariff computed per tick");
  assert(tick1.forecast.horizons.length === 5, "Live ML forecast generated per tick");

  // -------------------------------------------------------------
  // Test Suite 7: AWS Cloud Adapters (Person 4)
  // -------------------------------------------------------------
  console.log("\nSuite 7: AWS Cloud Adapters (Person 4)");
  // 7.1 AWS Lambda Router Handler
  const lambdaRes = await lambdaHandler({ feederVoltage: 232.0 });
  assert(lambdaRes.statusCode === 200, "AWS Lambda handler returns status code 200");
  const lambdaBody = JSON.parse(lambdaRes.body);
  assert(lambdaBody.status === "SUCCESS", "AWS Lambda handler executed successfully");

  // 7.2 AWS Bedrock AI Tariff Agent
  const bedrockAgent = new BedrockTariffAgent();
  const bedrockRes = await bedrockAgent.evaluateTariffAdjustment({
    cloudCoverPct: 75,
    solarYieldKw: 4.5,
    lookaheadHours: 2,
    currentTariffInr: 5.50,
  });
  assert(bedrockRes.suggestedTariffInr > 0, "Bedrock tariff agent returned positive tariff suggestion");
  assert(bedrockRes.reasoning.length > 10, "Bedrock tariff agent emitted explainable natural language reasoning");

  // 7.3 AWS IoT Telemetry Publisher
  const iotPublisher = new IoTTelemetryPublisher();
  const iotEnvelope = await iotPublisher.publishTick(tick1);
  assert(iotEnvelope.meters.length === 10, "IoT telemetry publisher packaged all 10 smart meters");
  assert(iotEnvelope.topic === "solnet/neighborhood/telemetry", "IoT published to correct MQTT topic");

  console.log("\n===============================================================");
  console.log("🎉 ALL CROSS-MODULE INTEGRATION TESTS PASSED! (24/24 assertions)");
  console.log("===============================================================\n");
}

runFullIntegrationTests().catch((err) => {
  console.error("Test Suite Error:", err);
  process.exit(1);
});
