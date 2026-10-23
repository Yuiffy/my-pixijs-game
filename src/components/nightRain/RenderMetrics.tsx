'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

export type RenderSnapshot = { calls: number; triangles: number; geometries: number; textures: number; frameMs: number };
type MetricsWindow = Window & { nightRainRender?: () => RenderSnapshot };

/** Read-only diagnostics; no scene traversal or frame history on the game path. */
export default function RenderMetrics() {
  const { gl } = useThree();
  const latest = useRef<RenderSnapshot>({ calls: 0, triangles: 0, geometries: 0, textures: 0, frameMs: 0 });
  useEffect(() => {
    const target = window as MetricsWindow;
    target.nightRainRender = () => ({ ...latest.current });
    return () => { delete target.nightRainRender; };
  }, []);
  useFrame((_, dt) => {
    latest.current.calls = gl.info.render.calls;
    latest.current.triangles = gl.info.render.triangles;
    latest.current.geometries = gl.info.memory.geometries;
    latest.current.textures = gl.info.memory.textures;
    latest.current.frameMs = dt * 1000;
  });
  return null;
}
