"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import type { RoadChunk } from "./cityStreaming";

const Chunk = memo(({ data }: { data: RoadChunk }) => {
  const geometry = useMemo(() => {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(data.positions, 3));
    g.setAttribute("color", new T.BufferAttribute(data.colors, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }, [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={`分区道路-${data.id}`} geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={0.95} side={T.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>;
});
export default memo(({ chunks }: { chunks: RoadChunk[] }) => {
  return <group name="渐进道路">{chunks.map(chunk => <Chunk key={chunk.id} data={chunk} />)}</group>;
});
