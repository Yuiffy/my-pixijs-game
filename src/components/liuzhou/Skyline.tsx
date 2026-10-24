"use client";

import { memo, useEffect, useRef } from "react";
import * as T from "three";
import type { SkylineData } from "./cityStreaming";

function Skyline({ model }: { model: SkylineData }) {
  const ref = useRef<T.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const matrix = new T.Matrix4(); const color = new T.Color();
    for (let i = 0; i < model.matrices.length / 16; i++) {
      mesh.setMatrixAt(i, matrix.fromArray(model.matrices, i * 16));
      mesh.setColorAt(i, color.fromArray(model.colors, i * 3));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [model]);
  return <instancedMesh name="柳州实际方位远景桥梁与城市" ref={ref} args={[undefined, undefined, model.matrices.length / 16]} userData={{ bridgeCount: model.bridgeCount, contextBuildings: model.buildings }}><boxGeometry /><meshStandardMaterial roughness={0.94} /></instancedMesh>;
}
export default memo(Skyline);
