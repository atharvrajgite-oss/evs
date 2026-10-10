"use client";

import React, { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { HouseNode } from "./HouseNode";
import { ParticleStream } from "./ParticleStream";
import { NodeState, TransferEvent } from "../../engine/router";

interface NeighborhoodSceneProps {
  nodes: (NodeState & { walletBalanceInr?: number; netSavingsVsGridInr?: number })[];
  transfers: TransferEvent[];
  selectedHouseId: string | null;
  onSelectHouse: (id: string | null) => void;
}

export const NeighborhoodScene: React.FC<NeighborhoodSceneProps> = ({
  nodes,
  transfers,
  selectedHouseId,
  onSelectHouse,
}) => {
  // Spatial coordinates for the 10 neighborhood houses
  // Two rows along a neighborhood street
  const housePositions: Record<string, [number, number, number]> = useMemo(() => {
    const coords: Record<string, [number, number, number]> = {};
    const xOffsets = [-8, -4, 0, 4, 8];

    // First 5 prosumers along north side (z = -3.5)
    for (let i = 0; i < 5; i++) {
      const houseId = nodes[i]?.id || `House_${i + 1}`;
      coords[houseId] = [xOffsets[i], 0, -3.5];
    }
    // Next 5 consumers along south side (z = 3.5)
    for (let i = 5; i < 10; i++) {
      const houseId = nodes[i]?.id || `House_${i + 1}`;
      coords[houseId] = [xOffsets[i - 5], 0, 3.5];
    }
    return coords;
  }, [nodes]);

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden border border-slate-800 bg-[#06090e]">
      <Canvas
        camera={{ position: [0, 16, 18], fov: 42 }}
        shadows
        className="w-full h-full"
      >
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={8}
          maxDistance={35}
        />

        {/* Lighting */}
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[12, 22, 10]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[0, 10, 0]} intensity={0.5} color="#38bdf8" />

        {/* Cybernetic Ground & Grid */}
        <Grid
          renderOrder={-1}
          position={[0, -0.01, 0]}
          infiniteGrid
          cellSize={1}
          cellThickness={0.6}
          cellColor="#1e293b"
          sectionSize={4}
          sectionThickness={1.2}
          sectionColor="#0ea5e9"
          fadeDistance={45}
        />

        {/* Central Street / Power Corridor */}
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[26, 3.2]} />
          <meshStandardMaterial
            color="#0f172a"
            roughness={0.8}
            metalness={0.1}
          />
        </mesh>

        {/* Street Line markings */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[24, 0.12]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} />
        </mesh>

        {/* Render House Nodes */}
        {nodes.map((node) => {
          const pos = housePositions[node.id] || [0, 0, 0];
          return (
            <HouseNode
              key={node.id}
              node={node}
              position={pos}
              isSelected={selectedHouseId === node.id}
              onSelect={() =>
                onSelectHouse(selectedHouseId === node.id ? null : node.id)
              }
            />
          );
        })}

        {/* Render P2P Energy Particle Streams */}
        {transfers.map((tx) => {
          const start = housePositions[tx.from];
          const end = housePositions[tx.to];
          if (!start || !end) return null;

          return (
            <ParticleStream
              key={`${tx.tradeId}_${tx.from}_${tx.to}`}
              startPos={start}
              endPos={end}
              kw={tx.kw}
            />
          );
        })}
      </Canvas>

      {/* Floating 3D Controls hint */}
      <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg glass-panel text-[11px] text-slate-400 pointer-events-none flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        <span>Left Click + Drag to Orbit • Scroll to Zoom • Click houses for details</span>
      </div>
    </div>
  );
};
