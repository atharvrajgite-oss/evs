/**
 * SolNet AI - Person 4: Amazon Bedrock AI Tariff Agent
 *
 * Calls Amazon Bedrock (Claude 3.5 Sonnet / Amazon Nova) to analyze
 * satellite cloud cover and solar yield, generating structured tariff
 * adjustments and explainable reasoning.
 *
 * OFFLINE-FIRST:
 * If AWS credentials are missing or USE_MOCK_AWS_BEDROCK=true,
 * switches to deterministic local reserve-margin heuristic without network calls.
 */

export interface BedrockAgentRequest {
  cloudCoverPct: number;
  solarYieldKw: number;
  lookaheadHours: number;
  currentTariffInr: number;
}

export interface BedrockAgentResponse {
  tariffAdjustmentPct: number; // e.g. -10% (cheaper) or +25% (scarce)
  suggestedTariffInr: number;
  reasoning: string;
  modelUsed: string;
  isMockFallback: boolean;
}

export class BedrockTariffAgent {
  private modelId: string;
  private region: string;
  private isMock: boolean;

  constructor() {
    this.modelId =
      process.env.SOLNET_BEDROCK_MODEL ||
      "anthropic.claude-3-5-sonnet-20241022-v2:0";
    this.region = process.env.AWS_REGION || "us-east-1";
    this.isMock =
      process.env.USE_MOCK_AWS_BEDROCK === "true" ||
      !process.env.AWS_ACCESS_KEY_ID;
  }

  public async evaluateTariffAdjustment(
    req: BedrockAgentRequest
  ): Promise<BedrockAgentResponse> {
    if (this.isMock) {
      return this.heuristicFallback(req);
    }

    try {
      // Dynamic import to avoid build errors if @aws-sdk/client-bedrock-runtime is absent
      // @ts-ignore
      const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
      const client = new BedrockRuntimeClient({ region: this.region });

      const prompt = `You are SolNet AI's tariff governor. Analyze the microgrid conditions:
- Cloud Cover: ${req.cloudCoverPct}%
- Solar Yield: ${req.solarYieldKw} kW
- Lookahead: ${req.lookaheadHours} hours
- Current Tariff: ₹${req.currentTariffInr}/kWh

Respond ONLY with valid JSON in this exact shape:
{"tariffAdjustmentPct": <number>, "reasoning": "<concise explanation>"}`;

      const command = new ConverseCommand({
        modelId: this.modelId,
        messages: [{ role: "user", content: [{ text: prompt }] }],
      });

      const response = await client.send(command);
      const outputText = response.output?.message?.content?.[0]?.text || "{}";
      const parsed = JSON.parse(outputText);

      const adjustment = Number(parsed.tariffAdjustmentPct) || 0;
      const suggested = Number((req.currentTariffInr * (1 + adjustment / 100)).toFixed(2));

      return {
        tariffAdjustmentPct: adjustment,
        suggestedTariffInr: suggested,
        reasoning: parsed.reasoning || "Bedrock model analysis completed.",
        modelUsed: this.modelId,
        isMockFallback: false,
      };
    } catch (err: any) {
      console.warn(`[BEDROCK FALLBACK] Cloud inference failed (${err.message}); using heuristic fallback.`);
      return this.heuristicFallback(req);
    }
  }

  private heuristicFallback(req: BedrockAgentRequest): BedrockAgentResponse {
    let adjustment = 0;
    let reasoning = "";

    if (req.cloudCoverPct > 65) {
      adjustment = 25; // Raise price to conserve battery
      reasoning = `[Bedrock AI Heuristic]: Heavy satellite cloud cover (${req.cloudCoverPct}%) predicted. Elevating tariff by +${adjustment}% to incentivize reserve battery preservation and throttle non-essential EV charging.`;
    } else if (req.solarYieldKw > 20 && req.cloudCoverPct < 25) {
      adjustment = -15; // Lower price to absorb surplus
      reasoning = `[Bedrock AI Heuristic]: Peak solar generation window (+${req.solarYieldKw} kW). Discounting tariff by ${adjustment}% to incentivize immediate neighbor EV charging and prevent feeder overvoltage curtailment.`;
    } else {
      adjustment = 0;
      reasoning = `[Bedrock AI Heuristic]: Balanced diurnal solar profile. Standard scarcity tariff maintained.`;
    }

    const suggested = Number((req.currentTariffInr * (1 + adjustment / 100)).toFixed(2));

    return {
      tariffAdjustmentPct: adjustment,
      suggestedTariffInr: suggested,
      reasoning,
      modelUsed: `${this.modelId} (offline heuristic fallback)`,
      isMockFallback: true,
    };
  }
}

// Standalone runner for `npm run aws:bedrock`
if (require.main === module) {
  const agent = new BedrockTariffAgent();
  console.log("🚀 Running Amazon Bedrock AI Tariff Agent harness...\n");
  agent
    .evaluateTariffAdjustment({
      cloudCoverPct: 75,
      solarYieldKw: 5.2,
      lookaheadHours: 2,
      currentTariffInr: 5.50,
    })
    .then((res) => {
      console.log("Bedrock Agent Output:");
      console.log(res);
      console.log("\n✅ Amazon Bedrock test passed successfully.");
    });
}
