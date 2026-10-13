import { FAN_COLORS, type Fan } from './fanEnemies';

function Ball({ at, scale, color }: { at: [number, number, number]; scale: [number, number, number]; color: string }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={color} /></mesh>;
}
/** Mascot heads and tails change silhouette without changing the readable weapon rig. */
export default function FanStyle({ fan }: { fan: Fan }) {
  const color = FAN_COLORS[fan];
  return (
    <group name={`fan-${fan}`}>
      {fan === 'biscuit' ? (
<group>
        <mesh position={[0, 1.58, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.43, 0.43, 0.24, 12]} /><meshStandardMaterial color={color} /></mesh>
        {[-1, 1].flatMap(x => [-1, 1].map(y => <Ball key={`${x},${y}`} at={[x * 0.25, 1.58 + y * 0.22, 0.13]} scale={[0.055, 0.06, 0.022]} color="#6b422c" />))}
      </group>
) : <Ball at={[0, 1.55, 0]} scale={fan === 'shark' ? [0.37, 0.3, 0.42] : [0.34, 0.29, 0.3]} color={color} />}
      {(fan === 'otter' || fan === 'rabbit') && [-1, 1].map(side => <Ball key={side} at={[side * 0.24, fan === 'rabbit' ? 2 : 1.78, 0]} scale={fan === 'rabbit' ? [0.09, 0.39, 0.08] : [0.12, 0.12, 0.09]} color={color} />)}
      {fan === 'otter' && <><Ball at={[0, 1.42, 0.28]} scale={[0.23, 0.14, 0.13]} color="#ead6b7" /><Ball at={[0, 0.65, -0.35]} scale={[0.17, 0.16, 0.6]} color={color} /></>}
      {fan === 'shark' && <><mesh position={[0, 1.98, -0.09]} rotation={[0, 0, 0.1]}><coneGeometry args={[0.21, 0.47, 3]} /><meshStandardMaterial color={color} /></mesh><Ball at={[0, 1.4, 0.29]} scale={[0.3, 0.12, 0.17]} color="#e5edf0" />{[-1, 1].map(side => <mesh key={side} position={[side * 0.17, 1.42, 0.44]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.065, 0.12, 3]} /><meshStandardMaterial color="white" /></mesh>)}</>}
      {fan === 'frog' && [-1, 1].map(side => <Ball key={side} at={[side * 0.23, 1.82, 0.12]} scale={[0.15, 0.16, 0.14]} color={color} />)}
      {[-1, 1].map(side => <Ball key={side} at={[side * (fan === 'frog' ? 0.23 : 0.13), fan === 'frog' ? 1.84 : 1.62, fan === 'shark' ? 0.36 : 0.29]} scale={[0.037, 0.051, 0.025]} color="#252831" />)}
    </group>
  );
}
