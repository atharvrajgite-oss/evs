/**
 * SolNet AI - Person 2 & 3: Integrated Neighborhood Telemetry & Physics Simulator
 *
 * Coordinates:
 * 1. 24-hour diurnal solar geometry & appliance/EV load profiles across 10 households.
 * 2. Feeder line voltage physics (with statutory overvoltage dynamics).
 * 3. Machine Learning multi-horizon Forecaster (15m, 30m, 1h, 2h, 4h).
 * 4. Dynamic Scarcity Tariff Agent (bounds clearing price between ₹3.00 and ₹8.50).
 * 5. 5-Tier Priority Router gated by Cedar Policy Engine.
 * 6. Financial Ledger with counterfactual savings and CO2 abatement metrics.
 * 7. Incident Presets: Cloud Cover Drop, Feeder Voltage Spike, Peers Disabled.
 */

import { NodeState, EnergyRouter, TransferEvent } from "../engine/router";
import { SolNetForecaster, NeighborhoodForecast } from "../ml/forecaster";
import { SolNetTariffAgent, DynamicTariffQuote } from "../agent/tariffAgent";
import { SolNetLedger, NeighborhoodLedgerSummary } from "../engine/ledger";
import { HouseTelemetry, WeatherTelemetry, calculateClearSkyFactor } from "../ml/mockData";

export interface SimulationTickResult {
  tick: number;
  timeOfDay: string;
  feederVoltage: number;
  cloudCoverPct: number;
  irradianceWm2: number;
  nodes: (NodeState & { walletBalanceInr: number; netSavingsVsGridInr: number })[];
  transfers: TransferEvent[];
  gridImports: number;
  gridExports: number;
  curtailedKw: number;
  tariff: DynamicTariffQuote;
  forecast: NeighborhoodForecast;
  ledger: NeighborhoodLedgerSummary;
  activeIncidents: {
    cloudDrop: boolean;
    voltageSpike: boolean;
    peersDisabled: boolean;
  };
}

export class NeighborhoodSimulator {
  private tickIndex: number = 32; // Default starting at 08:00 AM (tick 32 of 96)
  private nodes: NodeState[] = [];
  
  // Modules
  public forecaster: SolNetForecaster;
  public tariffAgent: SolNetTariffAgent;
  public ledger: SolNetLedger;

  // Incident overrides for live hackathon demo
  public cloudDropActive: boolean = false;
  public voltageSpikeActive: boolean = false;
  public peersDisabled: boolean = false;

  constructor() {
    this.forecaster = new SolNetForecaster();
    this.tariffAgent = new SolNetTariffAgent();
    this.ledger = new SolNetLedger();
    this.resetNeighborhood();
  }

  public resetNeighborhood(): void {
    this.nodes = [
      // 5 Solar Prosumer Houses
      { id: "House_1", solarKw: 0, loadKw: 1.2, batterySoc: 65, batteryCapacityKwh: 10, hasSolar: true },
      { id: "House_2", solarKw: 0, loadKw: 2.1, batterySoc: 80, batteryCapacityKwh: 14, hasSolar: true },
      { id: "House_3", solarKw: 0, loadKw: 0.9, batterySoc: 45, batteryCapacityKwh: 8,  hasSolar: true },
      { id: "House_4", solarKw: 0, loadKw: 1.5, batterySoc: 55, batteryCapacityKwh: 12, hasSolar: true },
      { id: "House_5", solarKw: 0, loadKw: 2.2, batterySoc: 70, batteryCapacityKwh: 16, hasSolar: true },
      // 5 Consumer-Only Houses
      { id: "House_6", solarKw: 0, loadKw: 2.8, batterySoc: 0,  batteryCapacityKwh: 0,  hasSolar: false },
      { id: "House_7", solarKw: 0, loadKw: 1.4, batterySoc: 0,  batteryCapacityKwh: 0,  hasSolar: false },
      { id: "House_8", solarKw: 0, loadKw: 3.6, batterySoc: 0,  batteryCapacityKwh: 0,  hasSolar: false },
      { id: "House_9", solarKw: 0, loadKw: 1.1, batterySoc: 0,  batteryCapacityKwh: 0,  hasSolar: false },
      { id: "House_10", solarKw: 0, loadKw: 2.5, batterySoc: 0, batteryCapacityKwh: 0,  hasSolar: false },
    ];
    this.ledger.resetLedger();
  }

  // Demo Control Presets
  public triggerCloudDrop(durationTicks: number = 8): void {
    this.cloudDropActive = true;
    setTimeout(() => {
      this.cloudDropActive = false;
    }, durationTicks * 1000);
  }

  public triggerVoltageSpike(): void {
    this.voltageSpikeActive = !this.voltageSpikeActive;
  }

  public togglePeersDisabled(): void {
    this.peersDisabled = !this.peersDisabled;
  }

  public nextTick(): SimulationTickResult {
    this.tickIndex = (this.tickIndex + 1) % 96; // 96 quarters in 24 hours
    const hour = Math.floor(this.tickIndex / 4);
    const minute = (this.tickIndex % 4) * 15;
    const timeOfDay = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    // Synthetic Date for ML clear-sky calculation
    const tickDate = new Date();
    tickDate.setHours(hour, minute, 0, 0);

    // 1. Solar generation curve & cloud attenuation
    let clearSkyFactor = calculateClearSkyFactor(tickDate);
    let cloudCoverPct = this.cloudDropActive ? 80 : 15 + Math.floor(Math.sin((this.tickIndex / 96) * Math.PI) * 20);
    const cloudAttenuation = 1.0 - (cloudCoverPct / 100) * 0.75;
    const irradianceWm2 = Math.round(clearSkyFactor * 1000 * cloudAttenuation);

    // 2. Feeder voltage physics (rises during high solar backfeed)
    let solarMultiplier = clearSkyFactor * cloudAttenuation;
    let feederVoltage = 230.0 + (solarMultiplier * 14.0);
    if (this.voltageSpikeActive) {
      feederVoltage = 255.4; // Exceeds 253.0V -> triggers Cedar trip
    }

    // 3. Update node solar generation (kW peak: 6kW, 8.5kW, 5kW, 7.2kW, 10kW)
    const solarPeaks = [6.0, 8.5, 5.0, 7.2, 10.0];
    for (let i = 0; i < 5; i++) {
      this.nodes[i].solarKw = Number((solarPeaks[i] * solarMultiplier).toFixed(2));
    }

    // Dynamic loads: morning peak (7-9 AM) & evening peak (6-10 PM)
    const isMorning = hour >= 7 && hour <= 9;
    const isEvening = hour >= 18 && hour <= 22;
    const loadMult = isEvening ? 2.2 : isMorning ? 1.6 : 1.0;

    // EV charging on consumer houses
    const evLoad = (isEvening || (hour >= 12 && hour <= 15)) ? 3.3 : 0;
    this.nodes[5].loadKw = Number((2.0 * loadMult + evLoad).toFixed(2));
    this.nodes[7].loadKw = Number((2.5 * loadMult + (isEvening ? 4.0 : 0)).toFixed(2));
    this.nodes[9].loadKw = Number((1.8 * loadMult + evLoad).toFixed(2));

    // 4. ML Multi-Horizon Forecast
    const telemetry: HouseTelemetry[] = this.nodes.map((n) => ({
      houseId: n.id,
      solarKw: n.solarKw,
      loadKw: n.loadKw,
      batterySoc: n.batterySoc,
      timestamp: tickDate.toISOString(),
    }));

    const weather: WeatherTelemetry = {
      cloudCoverPct,
      irradianceWm2,
      temperatureC: 28,
      timestamp: tickDate.toISOString(),
    };

    const forecast = this.forecaster.forecast(telemetry, weather, undefined, tickDate);

    // 5. Dynamic Tariff Agent
    const tariff = this.tariffAgent.calculateTariff(forecast);

    // 6. 5-Tier Priority Energy Router & Cedar Policy Engine
    let routingResult;
    if (this.peersDisabled) {
      // Counterfactual simulation: bypass peer trading
      routingResult = {
        transfers: [],
        gridImports: Number(this.nodes.reduce((s, n) => s + Math.max(0, n.loadKw - n.solarKw), 0).toFixed(2)),
        gridExports: Number(this.nodes.reduce((s, n) => s + Math.max(0, n.solarKw - n.loadKw), 0).toFixed(2)),
        curtailedKw: 0,
        totalP2pKwh: 0,
      };
    } else {
      routingResult = EnergyRouter.routeTick(
        this.nodes,
        feederVoltage,
        50.0,
        tariff,
        this.ledger
      );
    }

    // 7. Enriched nodes with wallet balances and counterfactual savings
    const enrichedNodes = this.nodes.map((n) => {
      const acc = this.ledger.getAccount(n.id);
      return {
        ...n,
        walletBalanceInr: acc ? acc.walletBalanceInr : 0,
        netSavingsVsGridInr: acc ? acc.netSavingsVsGridInr : 0,
      };
    });

    return {
      tick: this.tickIndex,
      timeOfDay,
      feederVoltage: Number(feederVoltage.toFixed(1)),
      cloudCoverPct,
      irradianceWm2,
      nodes: JSON.parse(JSON.stringify(enrichedNodes)),
      transfers: routingResult.transfers,
      gridImports: routingResult.gridImports,
      gridExports: routingResult.gridExports,
      curtailedKw: routingResult.curtailedKw,
      tariff,
      forecast,
      ledger: this.ledger.getNeighborhoodSummary(),
      activeIncidents: {
        cloudDrop: this.cloudDropActive,
        voltageSpike: this.voltageSpikeActive,
        peersDisabled: this.peersDisabled,
      },
    };
  }
}
