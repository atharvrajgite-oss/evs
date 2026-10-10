"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { NodeState } from "../../engine/router";

interface HouseNodeProps {
  node: NodeState & { walletBalanceInr?: number; netSavingsVsGridInr?: number };
  position: [number, number, number];
  isSelected: boolean;
  onSelect: () => void;
}

export const HouseNode: React.FC<HouseNodeProps> = ({
  node,
  position,
  isSelected,
  onSelect,
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);

  const isProsumer = (node.hasSolar || node.batteryCapacityKwh > 0 || node.solarKw > 0);
  const netKw = Number((node.solarKw - node.loadKw).toFixed(2));
  const isSurplus = netKw > 0;

  // Pulse animation for solar generation aura
  useFrame((state) => {
    if (auraRef.current && isProsumer && node.solarKw > 0.5) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.08;
      auraRef.current.scale.set(scale, scale, scale);
    }
  });

  // Color mappings
  const roofColor = isProsumer
    ? node.solarKw > 0.5
      ? "#f59e0b" // Glowing Amber/Gold Solar
      : "#3b82f6" // Solar equipped, night
    : "#64748b"; // Slate / consumer

  const wallColor = isSelected ? "#38bdf8" : "#1e293b";

  // Battery height bar (0 to 1.5 units)
  const batteryBarHeight = Math.max(0.1, (node.batterySoc / 100) * 1.5);
  const batteryColor =
    node.batterySoc > 60 ? "#22c55e" : node.batterySoc > 25 ? "#eab308" : "#ef4444";

  return (
    <group ref={meshRef} position={position} onClick={onSelect}>
      {/* Selection ring on ground */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.8, 2.2, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} />
        </mesh>
      )}

      {/* Solar Generation Aura */}
      {isProsumer && node.solarKw > 0.5 && (
        <mesh ref={auraRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[1.5, 2.5, 32]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} />
        </mesh>
      )}

      {/* Main House Body */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.5, 1.8]} />
        <meshStandardMaterial
          color={wallColor}
          metalness={0.2}
          roughness={0.7}
        />
      </mesh>

      {/* Pitched Roof */}
      <mesh position={[0, 1.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.5, 0.9, 4]} />
        <meshStandardMaterial
          color={roofColor}
          roughness={0.4}
          emissive={isProsumer && node.solarKw > 1 ? roofColor : "#000000"}
          emissiveIntensity={isProsumer && node.solarKw > 1 ? 0.35 : 0}
        />
      </mesh>

      {/* Solar Panel Array on Prosumers */}
      {isProsumer && (
        <mesh position={[0, 1.7, 0.6]} rotation={[-Math.PI / 6, 0, 0]}>
          <boxGeometry args={[1.1, 0.05, 0.7]} />
          <meshStandardMaterial
            color="#0284c7"
            metalness={0.8}
            roughness={0.2}
            emissive="#0369a1"
            emissiveIntensity={node.solarKw > 0 ? 0.5 : 0}
          />
        </mesh>
      )}

      {/* Battery Cylinder Indicator (Prosumers only) */}
      {node.batteryCapacityKwh > 0 && (
        <group position={[1.2, 0, 0]}>
          {/* Base pedestal */}
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.25, 0.28, 0.2, 16]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          {/* Active Charge Level */}
          <mesh position={[0, 0.2 + batteryBarHeight / 2, 0]}>
            <cylinderGeometry args={[0.2, 0.2, batteryBarHeight, 16]} />
            <meshStandardMaterial
              color={batteryColor}
              emissive={batteryColor}
              emissiveIntensity={0.6}
            />
          </mesh>
        </group>
      )}

      {/* 3D Label & Status HUD */}
      <Html position={[0, 2.7, 0]} center distanceFactor={14}>
        <div
          className={`pointer-events-none select-none px-2.5 py-1 rounded-md text-[10px] font-mono tracking-tight transition-all duration-200 border whitespace-nowrap shadow-lg ${
            isSelected
              ? "bg-cyan-950/90 text-cyan-200 border-cyan-400 scale-110"
              : "bg-slate-900/80 text-slate-200 border-slate-700/60"
          }`}
        >
          <div className="font-bold flex items-center gap-1.5">
            <span>{node.id.replace("_", " ")}</span>
            {isProsumer ? (
              <span className="text-amber-400 text-[9px] px-1 py-0.2 bg-amber-950/60 rounded">PV</span>
            ) : (
              <span className="text-purple-400 text-[9px] px-1 py-0.2 bg-purple-950/60 rounded">LOAD</span>
            )}
          </div>
          <div className="flex gap-2 text-[9px] text-slate-300 mt-0.5">
            <span className="text-amber-400 font-semibold">☀️ {node.solarKw}kW</span>
            <span className="text-rose-400 font-semibold">⚡ {node.loadKw}kW</span>
            {node.batteryCapacityKwh > 0 && (
              <span className="text-emerald-400">🔋 {node.batterySoc}%</span>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
};
