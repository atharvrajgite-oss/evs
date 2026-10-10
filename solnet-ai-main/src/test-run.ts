// src/test-run.ts
import { NeighborhoodSimulator } from "./sim/simulator";

const sim = new NeighborhoodSimulator();

console.log("Simulating midday generation (Tick 48: 12:00 PM)...");
for (let i = 0; i < 48; i++) {
  sim.nextTick();
}

const midday = sim.nextTick();
console.log(`Time: ${midday.timeOfDay} | Feeder Voltage: ${midday.feederVoltage}V`);
console.log("Active P2P Transfers:", midday.transfers);
console.log(`Grid Imports: ${midday.gridImports} kW | Grid Exports: ${midday.gridExports} kW`);

console.log("\nSimulating Voltage Spike Incident...");
sim.triggerVoltageSpike();
const spikeTick = sim.nextTick();
console.log(`Time: ${spikeTick.timeOfDay} | Feeder Voltage: ${spikeTick.feederVoltage}V`);
console.log("Transfers after voltage spike:", spikeTick.transfers);