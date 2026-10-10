/**
 * SolNet AI - Person 3: Data Contracts & Mock Telemetry Layer
 *
 * Provides shared data models and zero-dependency mock generators for:
 * 1. Household smart meter telemetry (Generation, Consumption, Battery SoC)
 * 2. Weather & satellite data feed (Cloud cover, Irradiance, Temperature)
 * 3. Energy routing decisions (From Person 2's Grid Router)
 *
 * When Person 2 and Person 4 complete their modules, simply swap:
 *   import { getMockTelemetry } from './mockData'
 * with:
 *   import { getLiveTelemetry } from '../sim/simulator'
 */

// ==========================================
// 1. SHARED INTERFACES (CONTRACTS)
// ==========================================

export interface HouseTelemetry {
  houseId: string;
  solarKw: number;
  loadKw: number;
  batterySoc: number; // 0 to 100%
  timestamp: string;
}

export interface WeatherTelemetry {
  cloudCoverPct: number;    // 0 to 100%
  irradianceWm2: number;    // Solar Irradiance in W/m² (0 to ~1000)
  temperatureC: number;     // Ambient temperature in Celsius
  timestamp: string;
}

export interface RoutingDecision {
  tradeId: string;
  sellerId: string;
  buyerId: string;
  kWhApproved: number;
  timestamp: string;
}

export interface HouseConfig {
  houseId: string;
  hasSolar: boolean;
  solarPeakKw: number;
  batteryCapacityKwh: number;
  baseLoadKw: number;
  hasEv: boolean;
}

// ==========================================
// 2. NEIGHBORHOOD SIMULATION CONFIGURATION
// ==========================================

export const NEIGHBORHOOD_HOUSES: HouseConfig[] = [
  // 5 Solar Prosumer Houses
  { houseId: 'House_1', hasSolar: true, solarPeakKw: 6.0, batteryCapacityKwh: 10, baseLoadKw: 1.2, hasEv: false },
  { houseId: 'House_2', hasSolar: true, solarPeakKw: 8.5, batteryCapacityKwh: 14, baseLoadKw: 1.8, hasEv: true },
  { houseId: 'House_3', hasSolar: true, solarPeakKw: 5.0, batteryCapacityKwh: 8, baseLoadKw: 0.9, hasEv: false },
  { houseId: 'House_4', hasSolar: true, solarPeakKw: 7.2, batteryCapacityKwh: 12, baseLoadKw: 1.5, hasEv: false },
  { houseId: 'House_5', hasSolar: true, solarPeakKw: 10.0, batteryCapacityKwh: 16, baseLoadKw: 2.2, hasEv: true },
  // 5 Consumer-Only Houses (No solar panels, prospective buyers)
  { houseId: 'House_6', hasSolar: false, solarPeakKw: 0.0, batteryCapacityKwh: 0, baseLoadKw: 2.0, hasEv: true },
  { houseId: 'House_7', hasSolar: false, solarPeakKw: 0.0, batteryCapacityKwh: 0, baseLoadKw: 1.4, hasEv: false },
  { houseId: 'House_8', hasSolar: false, solarPeakKw: 0.0, batteryCapacityKwh: 0, baseLoadKw: 3.1, hasEv: true },
  { houseId: 'House_9', hasSolar: false, solarPeakKw: 0.0, batteryCapacityKwh: 0, baseLoadKw: 1.1, hasEv: false },
  { houseId: 'House_10', hasSolar: false, solarPeakKw: 0.0, batteryCapacityKwh: 0, baseLoadKw: 2.5, hasEv: true },
];

// In-memory state tracking battery levels across consecutive ticks
const batteryStateMap: Map<string, number> = new Map(
  NEIGHBORHOOD_HOUSES.map((h) => [h.houseId, h.hasSolar ? 65 : 0])
);

// ==========================================
// 3. MOCK DATA GENERATORS
// ==========================================

/**
 * Calculates theoretical clear-sky solar radiation factor (0.0 to 1.0)
 * based on the time of day (sunrise ~06:00, peak ~12:30, sunset ~18:30).
 */
export function calculateClearSkyFactor(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  const sunrise = 6.0;
  const sunset = 18.5;

  if (hours <= sunrise || hours >= sunset) {
    return 0.0;
  }

  // Bell-shaped sine curve during daylight hours
  const daylightFraction = (hours - sunrise) / (sunset - sunrise);
  return Math.sin(daylightFraction * Math.PI);
}

/**
 * Generates synthetic weather telemetry (satellite/sensor feed from Person 4).
 */
export function getMockWeather(cloudCoverOverride?: number, customTime?: Date): WeatherTelemetry {
  const now = customTime ?? new Date();
  const clearSkyFactor = calculateClearSkyFactor(now);
  const cloudCoverPct = cloudCoverOverride !== undefined
    ? Math.max(0, Math.min(100, cloudCoverOverride))
    : Math.floor(15 + Math.random() * 20); // Default partly cloudy ~15-35%

  // Cloud cover attenuates direct solar irradiance
  const cloudAttenuation = 1.0 - (cloudCoverPct / 100) * 0.75;
  const irradianceWm2 = Math.round(clearSkyFactor * 1000 * cloudAttenuation);
  const temperatureC = Math.round(24 + clearSkyFactor * 10 + (Math.random() * 2 - 1));

  return {
    cloudCoverPct,
    irradianceWm2,
    temperatureC,
    timestamp: now.toISOString(),
  };
}

/**
 * Generates live telemetry for all 10 neighborhood houses matching Person 2's format.
 */
export function getMockTelemetry(
  cloudCoverPct: number = 20,
  customTime?: Date
): HouseTelemetry[] {
  const now = customTime ?? new Date();
  const hours = now.getHours() + now.getMinutes() / 60;
  const clearSkyFactor = calculateClearSkyFactor(now);
  const cloudAttenuation = 1.0 - (cloudCoverPct / 100) * 0.75;

  return NEIGHBORHOOD_HOUSES.map((house) => {
    // 1. Solar Generation
    let solarKw = 0;
    if (house.hasSolar) {
      const rawSolar = house.solarPeakKw * clearSkyFactor * cloudAttenuation;
      // Add slight sensor noise (±3%)
      const noise = 1 + (Math.random() * 0.06 - 0.03);
      solarKw = Math.max(0, Number((rawSolar * noise).toFixed(2)));
    }

    // 2. Household Load Profile (Morning and Evening peaks)
    const isMorningPeak = hours >= 7 && hours <= 9.5;
    const isEveningPeak = hours >= 18.5 && hours <= 22.5;
    let loadMultiplier = 1.0;
    if (isMorningPeak) loadMultiplier = 1.8;
    if (isEveningPeak) loadMultiplier = 2.4;
    if (hours >= 0 && hours < 5.5) loadMultiplier = 0.5; // Late night lull

    // EV charging adds substantial intermittent load (3.3 kW to 7 kW)
    let evLoad = 0;
    if (house.hasEv && (hours >= 13 && hours <= 16 || hours >= 20 && hours <= 23)) {
      evLoad = 3.3 + Math.random() * 2.0;
    }

    const loadNoise = 0.9 + Math.random() * 0.2;
    const loadKw = Number(((house.baseLoadKw * loadMultiplier + evLoad) * loadNoise).toFixed(2));

    // 3. Battery State of Charge (SoC)
    let currentSoc = batteryStateMap.get(house.houseId) ?? 50;
    if (house.hasSolar) {
      const netSurplusKw = solarKw - loadKw;
      // 15-minute simulated tick = 0.25h
      const netDeltaKwh = netSurplusKw * 0.25;
      const socDelta = (netDeltaKwh / house.batteryCapacityKwh) * 100;
      currentSoc = Math.max(10, Math.min(100, currentSoc + socDelta));
      batteryStateMap.set(house.houseId, Math.round(currentSoc));
    } else {
      currentSoc = 0;
    }

    return {
      houseId: house.houseId,
      solarKw,
      loadKw,
      batterySoc: Math.round(currentSoc),
      timestamp: now.toISOString(),
    };
  });
}

/**
 * Generates synthetic historical time-series data for training/calibrating
 * the ML Ridge Regression forecaster.
 */
export function generateHistoricalTrainingData(days: number = 7): {
  timestamps: Date[];
  weather: WeatherTelemetry[];
  telemetry: HouseTelemetry[][];
} {
  const timestamps: Date[] = [];
  const weather: WeatherTelemetry[] = [];
  const telemetry: HouseTelemetry[][] = [];

  const intervalMinutes = 15;
  const totalTicks = (days * 24 * 60) / intervalMinutes;
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);
  startTime.setMinutes(0, 0, 0);

  for (let i = 0; i < totalTicks; i++) {
    const tickTime = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);
    // Cloud cover varies smoothly with random walk
    const cloud = Math.floor(10 + 40 * Math.sin((i / 96) * Math.PI) + Math.random() * 15);
    const clampedCloud = Math.max(5, Math.min(95, cloud));

    const w = getMockWeather(clampedCloud, tickTime);
    const t = getMockTelemetry(clampedCloud, tickTime);

    timestamps.push(tickTime);
    weather.push(w);
    telemetry.push(t);
  }

  return { timestamps, weather, telemetry };
}

/**
 * Simulates routing decisions (matching Person 2's grid router) for testing the ledger.
 */
export function simulateMockRoutingDecisions(
  telemetry: HouseTelemetry[],
  tickDurationHours: number = 0.25
): RoutingDecision[] {
  const decisions: RoutingDecision[] = [];

  // Identify sellers (prosumers with solar > load and battery > 40%)
  const sellers = telemetry
    .filter((h) => h.solarKw > h.loadKw && h.batterySoc > 35)
    .map((h) => ({
      houseId: h.houseId,
      surplusKw: h.solarKw - h.loadKw,
    }));

  // Identify buyers (houses with load > solar)
  const buyers = telemetry
    .filter((h) => h.loadKw > h.solarKw)
    .map((h) => ({
      houseId: h.houseId,
      deficitKw: h.loadKw - h.solarKw,
    }));

  let tradeCount = 1;
  for (const seller of sellers) {
    if (seller.surplusKw <= 0) continue;

    for (const buyer of buyers) {
      if (buyer.deficitKw <= 0 || seller.surplusKw <= 0) continue;

      const matchedKw = Math.min(seller.surplusKw, buyer.deficitKw);
      const kWhApproved = Number((matchedKw * tickDurationHours).toFixed(3));

      if (kWhApproved > 0.05) {
        decisions.push({
          tradeId: `TRD_${Date.now()}_${tradeCount++}`,
          sellerId: seller.houseId,
          buyerId: buyer.houseId,
          kWhApproved,
          timestamp: new Date().toISOString(),
        });

        seller.surplusKw -= matchedKw;
        buyer.deficitKw -= matchedKw;
      }
    }
  }

  return decisions;
}
