"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { HeaderHUD } from "../components/dashboard/HeaderHUD";
import { ControlPanel } from "../components/dashboard/ControlPanel";
import { TariffCard } from "../components/dashboard/TariffCard";
import { ForecastMatrix } from "../components/dashboard/ForecastMatrix";
import { LedgerCard } from "../components/dashboard/LedgerCard";
import { NeighborhoodSimulator, SimulationTickResult } from "../sim/simulator";

// Dynamically import 3D Canvas to disable SSR for WebGL
const NeighborhoodScene = dynamic(
  () =>
    import("../components/3d/NeighborhoodScene").then((m) => m.NeighborhoodScene),
  { ssr: false }
);

export default function DashboardPage() {
  const [data, setData] = useState<SimulationTickResult | null>(null);
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isUsingLiveServer, setIsUsingLiveServer] = useState(false);

  // Local simulator fallback if backend SSE is starting or offline
  const localSimRef = useRef<NeighborhoodSimulator | null>(null);

  useEffect(() => {
    // 1. Initialize local simulator
    localSimRef.current = new NeighborhoodSimulator();
    setData(localSimRef.current.nextTick());

    // 2. Attempt to connect to SSE stream on port 4000
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("http://localhost:4000/api/stream");

      eventSource.onopen = () => {
        setIsUsingLiveServer(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
          setIsUsingLiveServer(true);
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      };

      eventSource.onerror = () => {
        // Fallback to local simulator interval
        setIsUsingLiveServer(false);
      };
    } catch (e) {
      setIsUsingLiveServer(false);
    }

    // 3. Fallback tick interval if SSE is not connected
    const fallbackTimer = setInterval(() => {
      if (!isUsingLiveServer && localSimRef.current && !isPaused) {
        setData(localSimRef.current.nextTick());
      }
    }, 1200);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(fallbackTimer);
    };
  }, [isUsingLiveServer, isPaused]);

  // Handler for Incident Triggers
  const handleTriggerCloudDrop = async () => {
    if (isUsingLiveServer) {
      fetch("http://localhost:4000/api/trigger/cloud-drop").catch(() => {});
    }
    if (localSimRef.current) {
      localSimRef.current.triggerCloudDrop(10);
      setData(localSimRef.current.nextTick());
    }
  };

  const handleTriggerVoltageSpike = async () => {
    if (isUsingLiveServer) {
      fetch("http://localhost:4000/api/trigger/voltage-spike").catch(() => {});
    }
    if (localSimRef.current) {
      localSimRef.current.triggerVoltageSpike();
      setData(localSimRef.current.nextTick());
    }
  };

  const handleTogglePeers = async () => {
    if (isUsingLiveServer) {
      fetch("http://localhost:4000/api/trigger/peers-toggle").catch(() => {});
    }
    if (localSimRef.current) {
      localSimRef.current.togglePeersDisabled();
      setData(localSimRef.current.nextTick());
    }
  };

  const handleReset = async () => {
    if (isUsingLiveServer) {
      fetch("http://localhost:4000/api/control", {
        method: "POST",
        body: JSON.stringify({ reset: true }),
      }).catch(() => {});
    }
    if (localSimRef.current) {
      localSimRef.current.resetNeighborhood();
      setData(localSimRef.current.nextTick());
    }
  };

  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (isUsingLiveServer) {
      fetch("http://localhost:4000/api/control", {
        method: "POST",
        body: JSON.stringify({ paused: nextPaused }),
      }).catch(() => {});
    }
  };

  const selectedNode =
    data?.nodes.find((n) => n.id === selectedHouseId) || null;

  return (
    <main className="min-h-screen p-3 md:p-5 flex flex-col gap-4 bg-[#06090e]">
      {/* Top Telemetry HUD */}
      <HeaderHUD data={data} />

      {/* Main Grid: 3D Canvas + Dashboard Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left/Center: 3D Virtual Microgrid Digital Twin */}
        <div className="lg:col-span-8 flex flex-col gap-3 min-h-[520px] lg:min-h-0">
          <div className="flex-1 w-full relative">
            <NeighborhoodScene
              nodes={data?.nodes || []}
              transfers={data?.transfers || []}
              selectedHouseId={selectedHouseId}
              onSelectHouse={setSelectedHouseId}
            />

            {/* Connection badge */}
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md glass-panel text-[10px] font-mono flex items-center gap-1.5 border border-slate-700/60">
              <span
                className={`w-2 h-2 rounded-full ${
                  isUsingLiveServer ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <span className="text-slate-300">
                {isUsingLiveServer ? "SSE STREAM CONNECTED (:4000)" : "LOCAL DIGITAL TWIN MODE"}
              </span>
            </div>
          </div>

          {/* Bottom ML Forecast Matrix */}
          <ForecastMatrix forecast={data?.forecast || null} />
        </div>

        {/* Right Sidebar: Controls & Economics */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <ControlPanel
            isPaused={isPaused}
            cloudDropActive={data?.activeIncidents?.cloudDrop || false}
            voltageSpikeActive={data?.activeIncidents?.voltageSpike || false}
            peersDisabled={data?.activeIncidents?.peersDisabled || false}
            onTogglePause={handleTogglePause}
            onTriggerCloudDrop={handleTriggerCloudDrop}
            onTriggerVoltageSpike={handleTriggerVoltageSpike}
            onTogglePeers={handleTogglePeers}
            onReset={handleReset}
          />

          <TariffCard tariff={data?.tariff || null} />

          <LedgerCard
            ledger={data?.ledger || null}
            transfers={data?.transfers || []}
            selectedNode={selectedNode}
          />
        </div>
      </div>
    </main>
  );
}
