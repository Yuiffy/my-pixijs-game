import { BOSS_ROSTER } from './bossRoster';
import { CharacterStyle } from './CharacterStyle';
import ReferencedBossStyle from './ReferencedBossStyle';
import type { EnemyKind } from './types';

function Gem({ at, size, color }: { at: [number, number, number]; size: [number, number, number]; color: string }) {
  return <mesh position={at} scale={size} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={color} /></mesh>;
}
export default function BossStyle({ kind }: { kind: EnemyKind }) {
  const b = BOSS_ROSTER[kind];
  if (!b) return null;
  if (kind === 'boss' || kind === 'captain') return <CharacterStyle skin={kind === 'boss' ? 'shiori' : 'nagisa'} />;
  if (b.character) return <ReferencedBossStyle character={b.character} />;
  return (
    <group name={`named-boss-${b.motif}`}>
      <mesh position={[0, 1.57, -0.045]}><sphereGeometry args={[0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65]} /><meshStandardMaterial color={b.hair} /></mesh>
      {[-2, -1, 0, 1, 2].map(n => <Gem key={n} at={[n * 0.082, 1.71 - Math.abs(n) * 0.016, 0.19]} size={[0.074, 0.09, 0.064]} color={b.hair} />)}
      {[-1, 1].map(n => <Gem key={n} at={[n * 0.24, 1.13, -0.06]} size={[0.1, b.motif === 'ink' ? 0.52 : 0.39, 0.1]} color={b.hair} />)}
      <Gem at={[0, 1.465, 0.24]} size={[0.025, 0.012, 0.012]} color="#b07878" />
      <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.28, b.motif === 'flower' ? 0.45 : 0.37, 0.36, 12]} /><meshStandardMaterial color={b.coat} /></mesh>
      <mesh position={[0, 1.18, 0.25]}><boxGeometry args={[0.22, 0.35, 0.03]} /><meshStandardMaterial color={b.trim} /></mesh>
      {(b.motif === 'stone' || b.motif === 'rock') && <group><Gem at={[0, 1.16, 0.22]} size={[0.35, 0.34, 0.15]} color={b.trim} /><Gem at={[-0.36, 1.25, 0]} size={[0.2, 0.2, 0.23]} color={b.trim} /><Gem at={[0.36, 1.25, 0]} size={[0.2, 0.2, 0.23]} color={b.trim} /><mesh position={[0, 1.94, 0]}><octahedronGeometry args={[0.22]} /><meshStandardMaterial color={b.eye} emissive={b.eye} emissiveIntensity={0.25} /></mesh></group>}
    </group>
  );
}

export function BossWeapon({ kind }: { kind: EnemyKind }) {
  const b = BOSS_ROSTER[kind];
  if (!b || kind === 'boss' || kind === 'captain') return null;
  return (
    <group>
      <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.035, 0.04, 1.65, 8]} /><meshStandardMaterial color={b.trim} metalness={0.4} /></mesh>
      {kind === 'regent' && <group position={[0, 1.45, 0]}>{[-1, 1].map(n => <mesh key={n} position={[n * 0.14, 0, 0]}><boxGeometry args={[0.13, 0.5, 0.16]} /><meshStandardMaterial color="#515967" emissive="#554363" emissiveIntensity={0.4} /></mesh>)}</group>}
      {kind === 'warden' && <group position={[0, 1.2, 0]}><mesh><boxGeometry args={[0.5, 0.7, 0.09]} /><meshStandardMaterial color="#555b70" /></mesh>{[-1, 1].map(n => <Gem key={n} at={[n * 0.17, 0.26, 0.06]} size={[0.09, 0.14, 0.04]} color={b.trim} />)}</group>}
      {kind === 'abbot' && <mesh position={[0, 1.4, 0]}><octahedronGeometry args={[0.25]} /><meshStandardMaterial color="#d4f1fb" metalness={0.5} roughness={0.15} /></mesh>}
      {kind === 'serpent' && <group position={[0, 1.45, 0]}><mesh rotation={[0.3, 0, 0]}><torusGeometry args={[0.24, 0.035, 6, 20]} /><meshStandardMaterial color={b.trim} /></mesh><Gem at={[0, 0, 0]} size={[0.13, 0.13, 0.13]} color="#e0eefb" /></group>}
      {kind === 'elegist' && <mesh position={[0, 1.53, 0]}><coneGeometry args={[0.14, 0.4, 8]} /><meshStandardMaterial color="#242436" /></mesh>}
      {(kind === 'colossus' || kind === 'sentinel') && <mesh position={[0, 1.4, 0]}><boxGeometry args={[0.65, 0.5, 0.45]} /><meshStandardMaterial color={b.trim} roughness={0.8} /></mesh>}
    </group>
  );
}
