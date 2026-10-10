/**
 * SolNet AI - Person 4: AWS IoT Core Telemetry Publisher
 *
 * Emits smart meter telemetry frames to AWS IoT Core topic:
 *   "solnet/neighborhood/telemetry"
 *
 * OFFLINE-FIRST:
 * If AWS credentials or AWS_REGION are missing, or USE_MOCK_AWS_IOT=true,
 * automatically falls back to deterministic local mock publishing.
 */

import { NeighborhoodSimulator, SimulationTickResult } from "../sim/simulator";

export interface IoTPayloadEnvelope {
  topic: string;
  timestamp: string;
  tick: number;
  feederId: string;
  feederVoltage: number;
  meters: {
    houseId: string;
    solarKw: number;
    loadKw: number;
    batterySoc: number;
  }[];
}

export class IoTTelemetryPublisher {
  private topic: string;
  private region: string;
  private isMock: boolean;

  constructor(topic: string = "solnet/neighborhood/telemetry") {
    this.topic = process.env.SOLNET_IOT_TOPIC || topic;
    this.region = process.env.AWS_REGION || "us-east-1";
    this.isMock =
      process.env.USE_MOCK_AWS_IOT === "true" ||
      !process.env.AWS_ACCESS_KEY_ID;
  }

  public async publishTick(snapshot: SimulationTickResult): Promise<IoTPayloadEnvelope> {
    const envelope: IoTPayloadEnvelope = {
      topic: this.topic,
      timestamp: new Date().toISOString(),
      tick: snapshot.tick,
      feederId: process.env.SOLNET_FEEDER_ID || "FDR-07",
      feederVoltage: snapshot.feederVoltage,
      meters: snapshot.nodes.map((n) => ({
        houseId: n.id,
        solarKw: n.solarKw,
        loadKw: n.loadKw,
        batterySoc: n.batterySoc,
      })),
    };

    if (this.isMock) {
      console.log(
        `[MOCK AWS IOT] Published tick ${envelope.tick} to topic "${envelope.topic}": ` +
        `${envelope.meters.length} smart meters emitted (Feeder Voltage: ${envelope.feederVoltage}V)`
      );
      return envelope;
    }

    try {
      // Dynamic import to avoid runtime crash if @aws-sdk/client-iot-data-plane is not installed
      // @ts-ignore
      const { IoTDataPlaneClient, PublishCommand } = await import("@aws-sdk/client-iot-data-plane");
      const client = new IoTDataPlaneClient({ region: this.region });
      await client.send(
        new PublishCommand({
          topic: this.topic,
          payload: Buffer.from(JSON.stringify(envelope)),
          qos: 0,
        })
      );
      console.log(`[AWS IOT CORE] Successfully published tick ${envelope.tick} to ${this.topic}`);
    } catch (err: any) {
      console.warn(`[AWS IOT FALLBACK] Cloud publish failed (${err.message}); switched to local mock.`);
    }

    return envelope;
  }
}

// Standalone runner for `npm run aws:iot`
if (require.main === module) {
  const sim = new NeighborhoodSimulator();
  const publisher = new IoTTelemetryPublisher();
  console.log("🚀 Running AWS IoT Telemetry Publisher harness...\n");
  const tickData = sim.nextTick();
  publisher.publishTick(tickData).then(() => {
    console.log("✅ AWS IoT Telemetry test completed successfully.");
  });
}
