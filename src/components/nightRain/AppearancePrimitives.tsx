export function Ball({ at, scale, color }: { at: [number, number, number]; scale: [number, number, number]; color: string }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>;
}
export function Box({ at, size, color, angle = 0 }: { at: [number, number, number]; size: [number, number, number]; color: string; angle?: number }) {
  return <mesh position={at} rotation={[0, 0, angle]} castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}
export function Ribbon({ at, color, scale = 1 }: { at: [number, number, number]; color: string; scale?: number }) {
  return <group position={at} scale={scale}>{[-1, 1].map(n => <group key={n}><Ball at={[n * 0.07, 0, 0]} scale={[0.085, 0.055, 0.035]} color={color} /><Box at={[n * 0.055, -0.09, 0]} size={[0.045, 0.15, 0.02]} color={color} angle={n * -0.25} /></group>)}<Ball at={[0, 0, 0.015]} scale={[0.032, 0.035, 0.03]} color={color} /></group>;
}
export function Braid({ x, y, z, color, length = 6 }: { x: number; y: number; z: number; color: string; length?: number }) {
  return <group name="side-braid">{Array.from({ length }, (_, i) => <Ball key={i} at={[x + (i % 2 ? -0.022 : 0.022), y - i * 0.09, z]} scale={[0.055, 0.063, 0.047]} color={color} />)}</group>;
}
export function Flower({ at, color, center, size = 1 }: { at: [number, number, number]; color: string; center: string; size?: number }) {
  return <group position={at} scale={size}>{Array.from({ length: 5 }, (_, i) => <Ball key={i} at={[Math.sin(i * Math.PI * 0.4) * 0.05, Math.cos(i * Math.PI * 0.4) * 0.05, 0]} scale={[0.035, 0.04, 0.016]} color={color} />)}<Ball at={[0, 0, 0.013]} scale={[0.023, 0.023, 0.017]} color={center} /></group>;
}
