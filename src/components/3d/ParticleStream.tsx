"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParticleStreamProps {
  startPos: [number, number, number];
  endPos: [number, number, number];
  kw: number;
}

export const ParticleStream: React.FC<ParticleStreamProps> = ({
  startPos,
  endPos,
  kw,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = Math.max(12, Math.min(36, Math.round(kw * 8)));

  // Generate 3D quadratic bezier curve arc
  const curve = useMemo(() => {
    const p0 = new THREE.Vector3(startPos[0], startPos[1] + 1.2, startPos[2]);
    const p2 = new THREE.Vector3(endPos[0], endPos[1] + 1.2, endPos[2]);
    // Midpoint arching upward
    const midX = (p0.x + p2.x) / 2;
    const midZ = (p0.z + p2.z) / 2;
    const dist = p0.distanceTo(p2);
    const midY = Math.max(p0.y, p2.y) + Math.min(3.5, dist * 0.35);
    const p1 = new THREE.Vector3(midX, midY, midZ);

    return new THREE.QuadraticBezierCurve3(p0, p1, p2);
  }, [startPos, endPos]);

  // Static line curve geometry
  const linePoints = useMemo(() => {
    return curve.getPoints(24);
  }, [curve]);

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(linePoints);
  }, [linePoints]);

  // Particle positions along the curve
  const { geometry, offsets } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const initialOffsets = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      initialOffsets[i] = i / particleCount;
      const point = curve.getPoint(initialOffsets[i]);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry: geom, offsets: initialOffsets };
  }, [curve, particleCount]);

  // Animate particles moving along curve
  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;

    // Flow speed proportional to kW transferred
    const speed = delta * 0.85;

    for (let i = 0; i < particleCount; i++) {
      offsets[i] = (offsets[i] + speed) % 1.0;
      const p = curve.getPoint(offsets[i]);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <group>
      {/* Subtle guide trajectory line */}
      <line geometry={lineGeometry}>
        <lineBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.25}
          linewidth={1}
        />
      </line>

      {/* Flowing energy particles */}
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          color="#22d3ee"
          size={0.22}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
};
