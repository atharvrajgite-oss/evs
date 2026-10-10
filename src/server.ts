/**
 * SolNet AI - Person 2 & 4: Integrated HTTP & SSE Streaming Server
 *
 * Exposes:
 * 1. GET  /api/stream                 - Server-Sent Events (SSE) live tick stream (1 tick/sec)
 * 2. GET  /api/state                  - Current instantaneous microgrid snapshot (JSON)
 * 3. GET  /api/config                 - Household specifications & capacity metadata
 * 4. POST /api/control                - Live controls (speed, pause, incident triggers, reset)
 * 5. GET  /api/trigger/voltage-spike  - Toggles statutory overvoltage trip (255.4V)
 * 6. GET  /api/trigger/cloud-drop     - Triggers 75% solar attenuation passing-cloud event
 * 7. GET  /api/trigger/peers-toggle   - Toggles microgrid peer trading (counterfactual test)
 */

import http from "node:http";
import { NeighborhoodSimulator, SimulationTickResult } from "./sim/simulator";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const sim = new NeighborhoodSimulator();

let isPaused = false;
let tickSpeedMs = 1000;
let latestSnapshot: SimulationTickResult = sim.nextTick();

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? "/";

  // 1. Live SSE Stream endpoint
  if (url === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Send immediate initial frame
    res.write(`data: ${JSON.stringify(latestSnapshot)}\n\n`);

    const interval: NodeJS.Timeout = setInterval(() => {
      if (!isPaused) {
        latestSnapshot = sim.nextTick();
      }
      res.write(`data: ${JSON.stringify(latestSnapshot)}\n\n`);
    }, tickSpeedMs);

    req.on("close", () => {
      clearInterval(interval);
    });
    return;
  }

  // 2. Snapshot JSON endpoint
  if (url === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(latestSnapshot));
    return;
  }

  // 3. Incident Triggers (GET shortcuts for browser testing)
  if (url === "/api/trigger/voltage-spike") {
    sim.triggerVoltageSpike();
    latestSnapshot = sim.nextTick();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", voltageSpikeActive: sim.voltageSpikeActive }));
    return;
  }

  if (url === "/api/trigger/cloud-drop") {
    sim.triggerCloudDrop(10);
    latestSnapshot = sim.nextTick();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", cloudDropActive: true }));
    return;
  }

  if (url === "/api/trigger/peers-toggle") {
    sim.togglePeersDisabled();
    latestSnapshot = sim.nextTick();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", peersDisabled: sim.peersDisabled }));
    return;
  }

  // 4. Interactive Control endpoint (POST /api/control)
  if (url === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (payload.paused !== undefined) isPaused = Boolean(payload.paused);
        if (payload.speedMs !== undefined) tickSpeedMs = Math.max(100, Number(payload.speedMs));
        if (payload.triggerCloudDrop) sim.triggerCloudDrop(payload.duration || 8);
        if (payload.triggerVoltageSpike !== undefined) sim.voltageSpikeActive = Boolean(payload.triggerVoltageSpike);
        if (payload.peersDisabled !== undefined) sim.peersDisabled = Boolean(payload.peersDisabled);
        if (payload.reset) {
          sim.resetNeighborhood();
          latestSnapshot = sim.nextTick();
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          state: {
            paused: isPaused,
            speedMs: tickSpeedMs,
            voltageSpikeActive: sim.voltageSpikeActive,
            cloudDropActive: sim.cloudDropActive,
            peersDisabled: sim.peersDisabled
          }
        }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  // 404 Fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`\n===============================================================`);
  console.log(`⚡ SolNet AI Unified Grid Simulator Server running on http://localhost:${PORT}`);
  console.log(`📡 SSE Stream:     http://localhost:${PORT}/api/stream`);
  console.log(`📊 Current State:  http://localhost:${PORT}/api/state`);
  console.log(`🎮 Quick Toggles:  /api/trigger/voltage-spike | /api/trigger/cloud-drop`);
  console.log(`===============================================================\n`);
});

export { server, sim };
