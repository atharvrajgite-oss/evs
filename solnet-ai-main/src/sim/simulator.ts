// src/sim/simulator.ts
import { NodeState, EnergyRouter, TransferEvent } from "../engine/router";

export interface SimulationTickResult {
  tick: number;
  timeOfDay: string;
  feederVoltage: number;
  nodes: NodeState[];
  transfers: TransferEvent[];
  gridImports: number;
  gridExports: number;
}

export class NeighborhoodSimulator {
  private tickIndex: number = 0;
  private nodes: NodeState[] = [];
  
  // Incident overrides for live hackathon demo
  public cloudDropActive: boolean = false;
  public voltageSpikeActive: boolean = false;

  constructor() {
    this.resetNeighborhood();
  }

  public resetNeighborhood(): void {
    this.nodes = [
      { id: "House_1_Solar_EV", solarKw: 0, loadKw: 1.2, batterySoc: 65, batteryCapacityKwh: 12 },
      { id: "House_2_Solar_Heavy", solarKw: 0, loadKw: 2.1, batterySoc: 80, batteryCapacityKwh: 15 },
      { id: "House_3_Solar_Light", solarKw: 0, loadKw: 0.8, batterySoc: 40, batteryCapacityKwh: 8 },
      { id: "House_4_NoSolar_EV", solarKw: 0, loadKw: 3.5, batterySoc: 0, batteryCapacityKwh: 0 },
      { id: "House_5_NoSolar_AC", solarKw: 0, loadKw: 2.4, batterySoc: 0, batteryCapacityKwh: 0 },
      { id: "House_6_NoSolar_Base", solarKw: 0, loadKw: 0.9, batterySoc: 0, batteryCapacityKwh: 0 },
    ];
  }

  // Demo Control Presets
  public triggerCloudDrop(durationTicks: number = 8): void {
    this.cloudDropActive = true;
    setTimeout(() => { this.cloudDropActive = false; }, durationTicks * 1000);
  }

  public triggerVoltageSpike(): void {
    this.voltageSpikeActive = !this.voltageSpikeActive;
  }

  public nextTick(): SimulationTickResult {
    this.tickIndex = (this.tickIndex + 1) % 96; // 96 quarters in 24 hours
    const hour = Math.floor(this.tickIndex / 4);
    const minute = (this.tickIndex % 4) * 15;
    const timeOfDay = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    // 1. Solar generation curve (peaks between 11:00 AM and 2:00 PM)
    let solarMultiplier = 0;
    if (hour >= 6 && hour <= 18) {
      solarMultiplier = Math.sin(((hour - 6) / 12) * Math.PI);
    }
    if (this.cloudDropActive) {
      solarMultiplier *= 0.25; // 75% solar drop during clouds
    }

    // 2. Feeder voltage physics (rises during high solar feed-in)
    let feederVoltage = 230.0 + (solarMultiplier * 14.0);
    if (this.voltageSpikeActive) {
      feederVoltage = 255.4; // Triggers Cedar trip
    }

    // 3. Update node generation and base load
    this.nodes[0].solarKw = Number((6.8 * solarMultiplier).toFixed(2));
    this.nodes[1].solarKw = Number((9.2 * solarMultiplier).toFixed(2));
    this.nodes[2].solarKw = Number((4.5 * solarMultiplier).toFixed(2));

    // Dynamic loads: evening peaks (6 PM to 10 PM)
    const isEveningPeak = hour >= 18 && hour <= 22;
    this.nodes[3].loadKw = isEveningPeak ? 5.2 : 2.0; // EV charging
    this.nodes[4].loadKw = (hour >= 12 && hour <= 16) ? 3.8 : 1.5; // AC midday run

    // 4. Run through Cedar policy and priority router
    const routingResult = EnergyRouter.routeTick(this.nodes, feederVoltage);

    return {
      tick: this.tickIndex,
      timeOfDay,
      feederVoltage: Number(feederVoltage.toFixed(1)),
      nodes: JSON.parse(JSON.stringify(this.nodes)),
      transfers: routingResult.transfers,
      gridImports: routingResult.gridImports,
      gridExports: routingResult.gridExports
    };
  }
}