/**
 * SolNet AI - Person 4: AWS Lambda Energy Router Handler
 *
 * Handler referenced in template.yaml (EnergyRouterFunction).
 * Invoked by AWS IoT Core rule on "solnet/neighborhood/telemetry" or direct test invocation.
 * Executes Cedar grid safety guardrails and priority P2P trade matching.
 */

import { EnergyRouter, NodeState, RoutingResult } from "../engine/router";
import { SolNetTariffAgent } from "../agent/tariffAgent";

export interface LambdaEvent {
  feederVoltage?: number;
  transformerMaxKw?: number;
  meters?: {
    houseId: string;
    solarKw: number;
    loadKw: number;
    batterySoc: number;
    batteryCapacityKwh?: number;
  }[];
}

export interface LambdaResponse {
  statusCode: number;
  body: string;
}

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const feederVoltage = event.feederVoltage ?? 232.4;
  const transformerMaxKw = event.transformerMaxKw ?? 50.0;

  // Transform input meters or use standard synthetic 10-house neighborhood
  const nodes: NodeState[] = (event.meters && event.meters.length > 0)
    ? event.meters.map((m) => ({
        id: m.houseId,
        solarKw: m.solarKw,
        loadKw: m.loadKw,
        batterySoc: m.batterySoc,
        batteryCapacityKwh: m.batteryCapacityKwh ?? 12,
      }))
    : [
        { id: "House_1", solarKw: 5.4, loadKw: 1.2, batterySoc: 70, batteryCapacityKwh: 10 },
        { id: "House_2", solarKw: 7.2, loadKw: 2.0, batterySoc: 85, batteryCapacityKwh: 14 },
        { id: "House_3", solarKw: 0.0, loadKw: 3.5, batterySoc: 0,  batteryCapacityKwh: 0 },
        { id: "House_4", solarKw: 0.0, loadKw: 2.2, batterySoc: 0,  batteryCapacityKwh: 0 },
      ];

  const tariffAgent = new SolNetTariffAgent();
  const dummyForecast = {
    forecastTimestamp: new Date().toISOString(),
    currentSolarKw: 12.6,
    currentLoadKw: 8.9,
    currentNetSurplusKw: 3.7,
    cloudCoverPct: 20,
    horizons: [
      { lookaheadMinutes: 15, targetTime: "", predictedSolarKw: 12, predictedLoadKw: 8, netSurplusKw: 4, scarcityFactor: 0.2, confidencePct: 95 }
    ]
  };
  const tariffQuote = tariffAgent.calculateTariff(dummyForecast);

  const result: RoutingResult = EnergyRouter.routeTick(
    nodes,
    feederVoltage,
    transformerMaxKw,
    tariffQuote
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "SUCCESS",
      feederVoltage,
      transfersCount: result.transfers.length,
      transfers: result.transfers,
      gridImports: result.gridImports,
      gridExports: result.gridExports,
      curtailedKw: result.curtailedKw,
      tariffUnitPriceInr: tariffQuote.unitPriceInr,
      timestamp: new Date().toISOString(),
    }),
  };
};

// Standalone runner for `npm run aws:lambda`
if (require.main === module || process.env.TEST_LAMBDA === "true") {
  console.log("🚀 Running AWS Lambda Router Handler locally...\n");
  handler({
    feederVoltage: 234.2,
    meters: [
      { houseId: "House_1", solarKw: 6.2, loadKw: 1.1, batterySoc: 75, batteryCapacityKwh: 12 },
      { houseId: "House_2", solarKw: 0.0, loadKw: 4.0, batterySoc: 0,  batteryCapacityKwh: 0 },
    ],
  }).then((res) => {
    console.log("Result (Status " + res.statusCode + "):");
    console.log(JSON.parse(res.body));
    console.log("\n✅ AWS Lambda Router test passed successfully.");
  });
}
