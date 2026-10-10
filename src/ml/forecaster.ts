/**
 * SolNet AI - Person 3: ML Forecaster Engine
 *
 * Implements:
 * 1. Multi-horizon Ridge Regression (L2-regularized) yield and load prediction
 *    (15m, 30m, 1h, 2h, and 4h lookahead horizons).
 * 2. Clear-sky physical irradiance model + satellite cloud cover attenuation.
 * 3. Neighborhood aggregate generation vs demand balance.
 * 4. Bedrock / Strands Agents SDK prompt synthesis for explainable AI reasoning.
 */

import { HouseTelemetry, WeatherTelemetry, calculateClearSkyFactor } from './mockData';

// ==========================================
// 1. DATA CONTRACTS
// ==========================================

export interface HorizonForecast {
  lookaheadMinutes: number;      // e.g. 15, 30, 60, 120, 240
  targetTime: string;
  predictedSolarKw: number;      // Aggregated solar output (kW)
  predictedLoadKw: number;       // Aggregated household load (kW)
  netSurplusKw: number;          // predictedSolarKw - predictedLoadKw
  scarcityFactor: number;        // 0.0 (high surplus) to 1.0 (extreme scarcity)
  confidencePct: number;         // Model confidence percentage (e.g., 94% down to 78%)
}

export interface NeighborhoodForecast {
  forecastTimestamp: string;
  currentSolarKw: number;
  currentLoadKw: number;
  currentNetSurplusKw: number;
  cloudCoverPct: number;
  horizons: HorizonForecast[];
  bedrockAgentExplanation?: string;
}

// Matrix helper types for closed-form Ridge Regression (X^T X + λI)^(-1) X^T y
type Matrix = number[][];
type Vector = number[];

// ==========================================
// 2. MATHEMATICAL RIDGE REGRESSION SOLVER
// ==========================================

/**
 * Solves (A) * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: Matrix, b: Vector): Vector {
  const n = A.length;
  // Augmented matrix
  const M: Matrix = A.map((row, i) => [...row, b[i]]);

  for (let k = 0; k < n; k++) {
    // Find pivot row
    let maxRow = k;
    let maxVal = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > maxVal) {
        maxVal = Math.abs(M[i][k]);
        maxRow = i;
      }
    }

    if (maxVal < 1e-12) {
      // Degenerate column; add small epsilon to diagonal
      M[k][k] += 1e-6;
    } else if (maxRow !== k) {
      const temp = M[k];
      M[k] = M[maxRow];
      M[maxRow] = temp;
    }

    // Eliminate below
    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) {
        M[i][j] -= factor * M[k][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / (M[i][i] || 1e-6);
  }

  return x;
}

/**
 * Computes Ridge Regression weights w = (X^T X + lambda * I)^(-1) X^T y
 */
function computeRidgeWeights(X: Matrix, y: Vector, lambda: number = 0.1): Vector {
  const m = X.length;       // Number of samples
  const n = X[0].length;    // Number of features

  // Compute X^T * X
  const XtX: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += X[k][i] * X[k][j];
      }
      XtX[i][j] = sum;
    }
  }

  // Add L2 penalty: lambda * I (skip bias term at index 0)
  for (let i = 0; i < n; i++) {
    XtX[i][i] += i === 0 ? 1e-6 : lambda;
  }

  // Compute X^T * y
  const Xty: Vector = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += X[k][i] * y[k];
    }
    Xty[i] = sum;
  }

  return solveLinearSystem(XtX, Xty);
}

// ==========================================
// 3. SOLAR & LOAD FORECASTER CLASS
// ==========================================

export class SolNetForecaster {
  // Horizon minutes we predict for
  public static readonly HORIZONS = [15, 30, 60, 120, 240];

  // Learned weights per horizon: horizon -> weights vector
  private solarModelWeights: Map<number, Vector> = new Map();
  private loadModelWeights: Map<number, Vector> = new Map();
  private isTrained: boolean = false;

  constructor() {
    this.initializeDefaultWeights();
  }

  /**
   * Initializes physically sound analytical weights before historical calibration.
   */
  private initializeDefaultWeights(): void {
    for (const h of SolNetForecaster.HORIZONS) {
      // Features: [bias, currentSolar, currentClearSky, targetClearSky, cloudAttenuation, hourSin, hourCos]
      this.solarModelWeights.set(h, [0.0, 0.45, -0.1, 0.55, 0.8, 0.05, -0.05]);
      // Features: [bias, currentLoad, hourSin, hourCos, isEveningPeak]
      this.loadModelWeights.set(h, [0.5, 0.75, 0.2, -0.3, 0.6]);
    }
    this.isTrained = true;
  }

  /**
   * Trains/calibrates the ridge regression weights using historical time-series.
   */
  public train(
    timestamps: Date[],
    weather: WeatherTelemetry[],
    telemetryHistory: HouseTelemetry[][]
  ): void {
    if (timestamps.length < 100) {
      console.warn('Insufficient historical data for training; using prior weights.');
      return;
    }

    const nSamples = timestamps.length;
    const intervalMins = 15;

    for (const horizon of SolNetForecaster.HORIZONS) {
      const stepOffset = Math.round(horizon / intervalMins);
      const X_solar: Matrix = [];
      const y_solar: Vector = [];
      const X_load: Matrix = [];
      const y_load: Vector = [];

      for (let i = 0; i < nSamples - stepOffset; i++) {
        const currTime = timestamps[i];
        const targetTime = timestamps[i + stepOffset];
        const currWeather = weather[i];
        const targetWeather = weather[i + stepOffset];
        const currTelem = telemetryHistory[i];
        const targetTelem = telemetryHistory[i + stepOffset];

        const currTotalSolar = currTelem.reduce((sum, h) => sum + h.solarKw, 0);
        const currTotalLoad = currTelem.reduce((sum, h) => sum + h.loadKw, 0);
        const targetTotalSolar = targetTelem.reduce((sum, h) => sum + h.solarKw, 0);
        const targetTotalLoad = targetTelem.reduce((sum, h) => sum + h.loadKw, 0);

        const currClearSky = calculateClearSkyFactor(currTime);
        const targetClearSky = calculateClearSkyFactor(targetTime);
        const cloudAtten = 1.0 - (targetWeather.cloudCoverPct / 100) * 0.75;
        const targetHours = targetTime.getHours() + targetTime.getMinutes() / 60;
        const hourRad = (targetHours / 24) * 2 * Math.PI;

        // Solar feature vector (7 features)
        X_solar.push([
          1.0,
          currTotalSolar,
          currClearSky,
          targetClearSky,
          cloudAtten,
          Math.sin(hourRad),
          Math.cos(hourRad),
        ]);
        y_solar.push(targetTotalSolar);

        // Load feature vector (5 features)
        const isEvening = targetHours >= 18 && targetHours <= 22 ? 1.0 : 0.0;
        X_load.push([
          1.0,
          currTotalLoad,
          Math.sin(hourRad),
          Math.cos(hourRad),
          isEvening,
        ]);
        y_load.push(targetTotalLoad);
      }

      // Compute Ridge Regression weights with L2 regularizer lambda = 0.25
      if (X_solar.length > 20) {
        this.solarModelWeights.set(horizon, computeRidgeWeights(X_solar, y_solar, 0.25));
        this.loadModelWeights.set(horizon, computeRidgeWeights(X_load, y_load, 0.15));
      }
    }

    this.isTrained = true;
  }

  /**
   * Generates a multi-horizon forecast given live telemetry and weather forecast.
   */
  public forecast(
    currentTelemetry: HouseTelemetry[],
    currentWeather: WeatherTelemetry,
    projectedCloudCoverPct?: number[], // Optional array of predicted cloud cover for each horizon
    baseTime?: Date
  ): NeighborhoodForecast {
    const now = baseTime ?? new Date();
    const currentSolar = Number(
      currentTelemetry.reduce((acc, h) => acc + h.solarKw, 0).toFixed(2)
    );
    const currentLoad = Number(
      currentTelemetry.reduce((acc, h) => acc + h.loadKw, 0).toFixed(2)
    );
    const currentNetSurplus = Number((currentSolar - currentLoad).toFixed(2));

    const horizons: HorizonForecast[] = [];

    for (let idx = 0; idx < SolNetForecaster.HORIZONS.length; idx++) {
      const hMins = SolNetForecaster.HORIZONS[idx];
      const targetDate = new Date(now.getTime() + hMins * 60 * 1000);
      const targetHours = targetDate.getHours() + targetDate.getMinutes() / 60;
      const hourRad = (targetHours / 24) * 2 * Math.PI;

      const currClearSky = calculateClearSkyFactor(now);
      const targetClearSky = calculateClearSkyFactor(targetDate);

      // Cloud cover projection (interpolated or override)
      const targetCloud = projectedCloudCoverPct && projectedCloudCoverPct[idx] !== undefined
        ? projectedCloudCoverPct[idx]
        : currentWeather.cloudCoverPct;
      const targetCloudAtten = 1.0 - (targetCloud / 100) * 0.75;

      // 1. Predict Solar
      let predSolar = 0;
      if (targetClearSky > 0) {
        const wSolar = this.solarModelWeights.get(hMins)!;
        const xSolar = [
          1.0,
          currentSolar,
          currClearSky,
          targetClearSky,
          targetCloudAtten,
          Math.sin(hourRad),
          Math.cos(hourRad),
        ];
        predSolar = xSolar.reduce((sum, val, i) => sum + val * (wSolar[i] || 0), 0);
        // Physical sanity clamp: cannot exceed theoretical clear sky peak capacity
        const neighborhoodPeakSolar = 36.7; // Sum of peak capacities of the 5 solar homes
        predSolar = Math.max(0, Math.min(neighborhoodPeakSolar * targetClearSky * targetCloudAtten, predSolar));
      }

      // 2. Predict Load
      const isEvening = targetHours >= 18 && targetHours <= 22 ? 1.0 : 0.0;
      const wLoad = this.loadModelWeights.get(hMins)!;
      const xLoad = [
        1.0,
        currentLoad,
        Math.sin(hourRad),
        Math.cos(hourRad),
        isEvening,
      ];
      let predLoad = xLoad.reduce((sum, val, i) => sum + val * (wLoad[i] || 0), 0);
      predLoad = Math.max(5.0, predLoad); // Neighborhood minimum base load ~5 kW

      predSolar = Number(predSolar.toFixed(2));
      predLoad = Number(predLoad.toFixed(2));
      const netSurplus = Number((predSolar - predLoad).toFixed(2));

      // Scarcity factor: 0.0 = total solar abundance, 1.0 = severe deficit
      let scarcityFactor = 1.0;
      if (predSolar > predLoad) {
        const ratio = (predSolar - predLoad) / (predSolar || 1);
        scarcityFactor = Math.max(0, Number((1.0 - ratio).toFixed(3)));
      } else {
        const deficitRatio = (predLoad - predSolar) / predLoad;
        scarcityFactor = Math.min(1.0, Number((0.5 + 0.5 * deficitRatio).toFixed(3)));
      }

      // Model confidence degrades further out into the horizon
      const confidencePct = Math.max(65, Math.round(98 - (hMins / 240) * 22));

      horizons.push({
        lookaheadMinutes: hMins,
        targetTime: targetDate.toISOString(),
        predictedSolarKw: predSolar,
        predictedLoadKw: predLoad,
        netSurplusKw: netSurplus,
        scarcityFactor,
        confidencePct,
      });
    }

    // Synthesize Bedrock / Claude 3.5 Agentic Reasoning
    const bedrockAgentExplanation = this.generateBedrockAgentExplanation(
      currentNetSurplus,
      horizons,
      currentWeather.cloudCoverPct
    );

    return {
      forecastTimestamp: now.toISOString(),
      currentSolarKw: currentSolar,
      currentLoadKw: currentLoad,
      currentNetSurplusKw: currentNetSurplus,
      cloudCoverPct: currentWeather.cloudCoverPct,
      horizons,
      bedrockAgentExplanation,
    };
  }

  /**
   * Synthesizes explainable reasoning mimicking Amazon Bedrock (Nova / Claude 3.5)
   * agentic output.
   */
  private generateBedrockAgentExplanation(
    currentSurplus: number,
    horizons: HorizonForecast[],
    cloudCoverPct: number
  ): string {
    const h1 = horizons[0]; // 15m
    const h4 = horizons[horizons.length - 1]; // 4h

    if (cloudCoverPct > 65) {
      return (
        `[Bedrock Agentic Forecaster - Alert]: High satellite cloud density (${cloudCoverPct}%) detected. ` +
        `Neighborhood generation will decline to ${h1.predictedSolarKw} kW within 15 mins. ` +
        `Recommendation: Elevate P2P floor tariff and throttle non-critical EV loads.`
      );
    }

    if (h4.predictedSolarKw <= 0.1 && h4.predictedLoadKw > 15) {
      return (
        `[Bedrock Agentic Forecaster]: Twilight transition projected within 4 hours. ` +
        `Solar output dropping to 0 kW while evening peak reaches ${h4.predictedLoadKw} kW. ` +
        `P2P tariff optimizer entering Pre-Evening Battery Reserve mode.`
      );
    }

    if (currentSurplus > 10) {
      return (
        `[Bedrock Agentic Forecaster]: Peak midday solar abundance confirmed (+${currentSurplus} kW net). ` +
        `Tariff discount recommended to encourage immediate neighbor EV absorption before grid curtailment.`
      );
    }

    return (
      `[Bedrock Agentic Forecaster]: Normal diurnal solar trajectory. ` +
      `Estimated 4-hour neighborhood surplus: ${h4.netSurplusKw} kW.`
    );
  }
}
