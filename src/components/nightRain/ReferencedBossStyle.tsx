import { Ball, Box, Braid, Flower, Ribbon } from './AppearancePrimitives';
import { characterAppearance, type CharacterId } from './characterAppearance';

function Hair({ color, long = true }: { color: string; long?: boolean }) {
  return <group name="reference-hair"><mesh position={[0, 1.57, -0.045]} castShadow><sphereGeometry args={[0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65]} /><meshStandardMaterial color={color} /></mesh>{[-2, -1, 0, 1, 2].map(n => <Ball key={n} at={[n * 0.082, 1.72 - Math.abs(n) * 0.012, 0.19]} scale={[0.071, 0.077, 0.064]} color={color} />)}{long && [-1, 1].map(n => <Ball key={n} at={[n * 0.24, 1.18, -0.12]} scale={[0.09, 0.44, 0.1]} color={color} />)}<Ball at={[0, 1.465, 0.242]} scale={[0.026, 0.012, 0.012]} color="#af756d" /></group>;
}
function Skirt({ color, wide = false }: { color: string; wide?: boolean }) {
  return <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.28, wide ? 0.43 : 0.37, 0.36, 12]} /><meshStandardMaterial color={color} /></mesh>;
}

/** Identity details are independent of the boss's weapon and encounter theme. */
export default function ReferencedBossStyle({ character }: { character: CharacterId }) {
  const p = characterAppearance(character);
  return (
<group name={`reference-${character}`}>
    <Hair color={p.hair} long={character !== 'mizuki'} />
    {character === 'harei' && (
<group name="harei-cat-ears-scarf">
      <Ball at={[0.3, 1.25, -0.22]} scale={[0.12, 0.5, 0.13]} color={p.hair} />
      {[-1, 1].map(n => <group key={n} rotation={[0, 0, n * -0.18]} position={[n * 0.2, 1.84, 0]}><mesh castShadow><coneGeometry args={[0.135, 0.32, 3]} /><meshStandardMaterial color={p.hair} /></mesh><mesh position={[0, 0.025, 0.045]}><coneGeometry args={[0.075, 0.22, 3]} /><meshStandardMaterial color="#a5a1b5" /></mesh></group>)}
      <Box at={[-0.19, 1.66, 0.19]} size={[0.11, 0.025, 0.022]} color={p.trim} angle={0.2} />
      <Flower at={[-0.2, 1.68, 0.215]} color={p.trim} center="#7f8299" size={0.66} />
      <mesh position={[0, 1.32, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.245, 0.085, 6, 16]} /><meshStandardMaterial color={p.trim} /></mesh>
      <Ribbon at={[0.15, 1.28, 0.27]} color={p.trim} scale={1.15} />
      <Box at={[-0.07, 1.04, 0.285]} size={[0.14, 0.46, 0.035]} color={p.trim} angle={-0.13} />
      <Box at={[0.1, 1.04, 0.285]} size={[0.1, 0.38, 0.035]} color={p.trim} angle={0.08} />
      <Skirt color={p.coat} wide />
      <Ball at={[-0.22, 0.93, 0.22]} scale={[0.075, 0.085, 0.02]} color={p.trim} />
      {[-1, 1].map(n => <Ball key={n} at={[-0.22 + n * 0.035, 1.01, 0.22]} scale={[0.025, 0.04, 0.02]} color={p.trim} />)}
    </group>
)}
    {character === 'mizuki' && (
<group name="mizuki-blonde-twin-curls">
      {[-1, 1].map(n => (
<group key={n}>
        <Ribbon at={[n * 0.27, 1.83, 0]} color={p.coat} scale={1.1} />
        <Box at={[n * 0.27, 1.82, 0.042]} size={[0.035, 0.12, 0.025]} color={p.accent} />
        {Array.from({ length: 5 }, (_, i) => <Ball key={i} at={[n * (0.3 + Math.sin(i * 1.4) * 0.035), 1.54 - i * 0.14, -0.09]} scale={[0.1, 0.11, 0.1]} color={p.hair} />)}
        <Ribbon at={[n * 0.3, 0.95, 0.015]} color={p.coat} scale={0.65} />
        <Ribbon at={[n * 0.12, 1.68, 0.245]} color={p.accent} scale={0.33} />
        <Box at={[n * 0.08, 1.29, 0.25]} size={[0.08, 0.17, 0.025]} color="#1e242d" angle={n * 0.4} />
        <Ball at={[0.15, 1.11 - (n + 1) * 0.06, 0.275]} scale={[0.018, 0.018, 0.01]} color={p.trim} />
      </group>
))}
      <Ribbon at={[0, 1.22, 0.275]} color="#151c26" scale={0.8} />
      <Skirt color={p.coat} />
      <mesh position={[0.055, 1.12, 0.278]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.115, 0.007, 4, 14, Math.PI]} /><meshStandardMaterial color={p.trim} metalness={0.6} /></mesh>
      <Ball at={[0.15, 1.21, 0.265]} scale={[0.035, 0.04, 0.018]} color={p.trim} />
      {[-1, 1].map(n => <Ball key={n} at={[0.15 + n * 0.02, 1.25, 0.265]} scale={[0.009, 0.028, 0.01]} color={p.trim} />)}
      {[-1, 1].map(n => <group key={n}><Ball at={[n * 0.39, 1.37, -0.2]} scale={[0.14, 0.12, 0.28]} color="#555c68" /><mesh position={[n * 0.39, 1.37, 0.08]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.064, 0.064, 0.1, 8]} /><meshStandardMaterial color="#bcb9bf" /></mesh></group>)}
    </group>
)}
    {character === 'rhea' && (
<group name="rhea-elf-clock-dress">
      {[-1, 1].map(n => <mesh key={n} position={[n * 0.285, 1.51, 0]} rotation={[0, 0, (-n * Math.PI) / 2]}><coneGeometry args={[0.055, 0.2, 5]} /><meshStandardMaterial color={p.skin} /></mesh>)}
      <Braid x={-0.22} y={1.62} z={-0.02} color={p.hair} length={3} />
      <group position={[0.14, 1.88, -0.02]} rotation={[0, 0, -0.22]} name="rhea-top-hat"><mesh><cylinderGeometry args={[0.105, 0.12, 0.21, 10]} /><meshStandardMaterial color={p.accent} /></mesh><mesh position={[0, -0.09, 0]}><cylinderGeometry args={[0.165, 0.165, 0.035, 12]} /><meshStandardMaterial color={p.accent} /></mesh><mesh position={[0, -0.025, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.009, 4, 12]} /><meshStandardMaterial color={p.trim} /></mesh></group>
      <Skirt color={p.coat} wide />
      <Box at={[0, 1.15, 0.25]} size={[0.34, 0.24, 0.035]} color={p.accent} />
      {[-1, 1].map(n => <Box key={n} at={[n * 0.065, 1.3, 0.27]} size={[0.055, 0.18, 0.025]} color={p.trim} angle={n * -0.55} />)}
      <mesh position={[0, 1.22, 0.28]}><octahedronGeometry args={[0.06]} /><meshStandardMaterial color={p.trim} /></mesh>
      <mesh position={[0, 0.69, 0]} rotation={[0, 0, 0.1]}><cylinderGeometry args={[0.325, 0.405, 0.028, 14]} /><meshStandardMaterial color={p.trim} /></mesh>
      {[-1, 1].map(n => <Box key={n} at={[n * 0.12, 0.72, 0.365]} size={[0.027, 0.13, 0.022]} color={p.trim} angle={n * -0.14} />)}
    </group>
)}
    {character === 'yua' && (
<group name="yua-glasses-blue-coat">
      <Ball at={[0, 1.25, -0.225]} scale={[0.27, 0.44, 0.1]} color={p.hair} />
      {[-1, 1].map(n => <Ball key={n} at={[n * 0.3, 1.01, -0.12]} scale={[0.1, 0.11, 0.04]} color={p.hair} />)}
      <mesh position={[0.025, 1.9, -0.02]} rotation={[0, 0, -0.6]}><torusGeometry args={[0.08, 0.014, 4, 12, Math.PI * 1.2]} /><meshStandardMaterial color={p.hair} /></mesh>
      {[-1, 1].map(n => <mesh key={n} position={[n * 0.089, 1.52, 0.267]}><torusGeometry args={[0.066, 0.008, 4, 18]} /><meshStandardMaterial color={p.trim} /></mesh>)}
      <Box at={[0, 1.535, 0.271]} size={[0.054, 0.008, 0.009]} color={p.trim} />
      {[-1, 1].map(n => <Box key={n} at={[n * 0.17, 1.535, 0.213]} size={[0.012, 0.01, 0.13]} color={p.trim} />)}
      {[0, 1].map(n => <Box key={n} at={[-0.17, 1.68 - n * 0.045, 0.19]} size={[0.09, 0.013, 0.025]} color={p.coat} angle={n ? -0.2 : 0.15} />)}
      <Flower at={[0.2, 1.7, 0.18]} color={p.coat} center={p.trim} size={0.7} />
      <Skirt color="#414b5c" />
      {[-1, 1].map(n => <Box key={n} at={[n * 0.21, 0.94, 0.26]} size={[0.13, 0.59, 0.065]} color={p.coat} angle={n * -0.08} />)}
      <Box at={[0, 1.12, 0.26]} size={[0.26, 0.33, 0.035]} color="#a9cbe5" />
      <Box at={[0, 1.23, 0.287]} size={[0.055, 0.16, 0.025]} color={p.accent} angle={0.07} />
      {[-1, 1].map(n => <group key={n}><Box at={[n * 0.235, 0.67, 0.31]} size={[0.07, 0.13, 0.025]} color={p.accent} /><Box at={[n * 0.23, 0.87, 0.305]} size={[0.025, 0.09, 0.014]} color={p.trim} angle={n * 0.4} /><Box at={[n * 0.23, 0.87, 0.31]} size={[0.09, 0.025, 0.014]} color={p.trim} angle={n * 0.4} /></group>)}
    </group>
)}
    {character === 'sumi' && (
<group name="sumi-dragon-horns-ribbons">
      {Array.from({ length: 9 }, (_, i) => <Ball key={i} at={[Math.sin((i - 4) * 0.25) * 0.29, 1.57 + Math.cos((i - 4) * 0.25) * 0.26, -0.03]} scale={[0.063, 0.075, 0.04]} color={p.trim} />)}
      {[-1, 1].map(n => <group key={n}><mesh position={[n * 0.19, 1.94, -0.025]} rotation={[0, 0, n * -0.25]}><coneGeometry args={[0.065, 0.3, 6]} /><meshStandardMaterial color={p.accent} /></mesh><mesh position={[n * 0.26, 1.98, -0.02]} rotation={[0, 0, n * -0.8]}><coneGeometry args={[0.042, 0.16, 6]} /><meshStandardMaterial color={p.accent} /></mesh><Ribbon at={[n * 0.245, 1.35, -0.03]} color="#7eb4d1" scale={0.65} /></group>)}
      <Skirt color={p.coat} wide />
      <Box at={[0, 0.99, 0.275]} size={[0.32, 0.45, 0.045]} color={p.trim} />
      <Ribbon at={[0, 1.24, 0.28]} color="#7eb4d1" scale={0.85} />
      <Box at={[0, 1.1, -0.3]} size={[0.4, 0.51, 0.1]} color="#d8c8af" />
    </group>
)}
    {character === 'rutice' && (
<group name="rutice-lavender-lily-crown">
      <Braid x={-0.24} y={1.45} z={-0.1} color={p.hair} length={6} />
      {Array.from({ length: 7 }, (_, i) => <Flower key={i} at={[Math.sin((i - 3) * 0.38) * 0.27, 1.69 + Math.cos((i - 3) * 0.38) * 0.1, 0.13]} color={p.accent} center={p.trim} size={0.72} />)}
      <Skirt color={p.coat} wide />
      <Box at={[0, 1.17, 0.25]} size={[0.29, 0.19, 0.035]} color={p.accent} />
      <Ribbon at={[0, 1.31, 0.266]} color={p.trim} scale={0.6} />
      {[-1, 1].map(n => <Ball key={n} at={[n * 0.34, 1.16, -0.015]} scale={[0.18, 0.16, 0.19]} color="#9a91a5" />)}
    </group>
)}
  </group>
);
}
