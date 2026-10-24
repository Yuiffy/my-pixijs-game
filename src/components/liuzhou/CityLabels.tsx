"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import { terrainHeight } from "./terrain";

export function CitySign({ text, at, width, height = width * 0.1875, angle = 0 }: { text: string; at: [number, number, number]; width: number; height?: number; angle?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 192;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#305950"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#ede1b6"; c.font = 'bold 104px "Microsoft YaHei", sans-serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 512, 98, 980);
    const result = new T.CanvasTexture(canvas); result.colorSpace = T.SRGBColorSpace; return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={at} rotation={[0, angle, 0]}>
      {[0, Math.PI].map(a => <mesh key={a} rotation={[0, a, 0]} position={[0, 0, a ? -0.012 : 0.012]}><planeGeometry args={[width, height]} /><meshStandardMaterial map={texture} roughness={0.85} /></mesh>)}
    </group>
  );
}
function CityLabels() {
  return (
    <group name="柳州扩区实地名称">
      <CitySign text="人 民 广 场" at={[-560, terrainHeight({ x: -560, z: -565 }) + 3, -565]} width={16} />
    </group>
  );
}
export default memo(CityLabels);
