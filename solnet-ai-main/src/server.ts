import http from "node:http";
import { NeighborhoodSimulator } from "./sim/simulator";

const PORT = 4000;
const sim = new NeighborhoodSimulator();

const server = http.createServer((req, res) => {
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

    const interval: NodeJS.Timeout = setInterval(() => {
      const tickData = sim.nextTick();
      res.write(`data: ${JSON.stringify(tickData)}\n\n`);
    }, 1000);

    req.on("close", () => {
      clearInterval(interval);
    });
    return;
  }

  // 2. Incident Trigger controls
  if (url === "/api/trigger/voltage-spike") {
    sim.triggerVoltageSpike();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", voltageSpikeActive: sim.voltageSpikeActive }));
    return;
  }

  if (url === "/api/trigger/cloud-drop") {
    sim.triggerCloudDrop(10);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", cloudDropActive: true }));
    return;
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`⚡ SolNet AI Grid Simulator Server running on http://localhost:${PORT}`);
  console.log(`📡 SSE Stream available at: http://localhost:${PORT}/api/stream`);
  console.log(`🎮 Incident Triggers ready: /api/trigger/voltage-spike & /api/trigger/cloud-drop`);
});