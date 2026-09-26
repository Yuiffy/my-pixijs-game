import type { PlayerSkin } from './types';

export const PLAYER_SKINS = {
  sui: { name: '岁己', coat: '#73618d', hair: '#d9dbe2', eye: '#78549c', trim: '#d9baa7', boots: '#263741' },
  shiori: { name: '栞栞', coat: '#eee7db', hair: '#f2dfb7', eye: '#78a5cb', trim: '#86704d', boots: '#61503f' },
  nagisa: { name: '米汀', coat: '#eee7dd', hair: '#bcc9d8', eye: '#7a9bb0', trim: '#343643', boots: '#242936' },
};
function Ball({ at, scale, color }:{ at:[number, number, number];scale:[number, number, number];color:string }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>;
}
function Box({ at, size, color, angle = 0 }:{ at:[number, number, number];size:[number, number, number];color:string;angle?:number }) {
  return <mesh position={at} rotation={[0, 0, angle]} castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}
function Ribbon({ at, color, scale = 1 }:{ at:[number, number, number];color:string;scale?:number }) {
  return <group position={at} scale={scale}>{[-1, 1].map(n => <group key={n}><Ball at={[n * 0.07, 0, 0]} scale={[0.085, 0.055, 0.035]} color={color} /><Box at={[n * 0.055, -0.09, 0]} size={[0.045, 0.15, 0.02]} color={color} angle={n * -0.25} /></group>)}<Ball at={[0, 0, 0.015]} scale={[0.032, 0.035, 0.03]} color={color} /></group>;
}
/** Reference-based silhouette and clothing mounted on the common combat rig. */
export function CharacterStyle({ skin }:{ skin:Exclude<PlayerSkin, 'sui'> }) {
  const palette = PLAYER_SKINS[skin]; const
shiori = skin === 'shiori';
  return (
<group name={`outfit-${skin}`}>
    <mesh position={[0, 1.56, -0.035]} castShadow><sphereGeometry args={[0.275, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.63]} /><meshStandardMaterial color={palette.hair} /></mesh>
    {/* Layered fringe leaves the eyes unobstructed. */}
    {[-2, -1, 0, 1, 2].map(n => <Ball key={n} at={[n * 0.085, 1.715 - Math.abs(n) * 0.012, 0.18]} scale={[0.073, 0.077, 0.067]} color={palette.hair} />)}
    {[-1, 1].map(n => (
<group key={n}>
      <Ball at={[n * 0.235, 1.22, -0.08]} scale={[0.09, 0.42, 0.10]} color={palette.hair} />
      <Ball at={[n * 0.25, 0.96, -0.12]} scale={[0.08, 0.2, 0.08]} color={palette.hair} />
      {shiori && <Ribbon at={[n * 0.26, 1.4, 0.02]} color="#fff7df" scale={0.65} />}
      <Ball at={[n * 0.145, 1.43, 0.201]} scale={[0.046, 0.018, 0.018]} color="#e7aaa0" />
    </group>
))}
    <Ball at={[0, 1.465, 0.241]} scale={[0.026, 0.012, 0.012]} color="#af756d" />
    {shiori ? (
<>
      <Ball at={[-0.025, 1.815, -0.04]} scale={[0.305, 0.12, 0.255]} color="#756047" />
      <Box at={[0, 1.79, 0.198]} size={[0.34, 0.05, 0.035]} color="#e5d5b5" />
      <Ribbon at={[0.245, 1.87, 0.025]} color="#fff8e8" scale={1.4} />
      <Box at={[-0.205, 1.715, 0.17]} size={[0.056, 0.06, 0.02]} color="#695c4d" angle={0.3} />
      {[-1, 1].map(n => <Box key={n} at={[n * 0.105, 1.245, 0.245]} size={[0.09, 0.27, 0.027]} color="#8b7351" angle={n * -0.4} />)}
      <Ribbon at={[0, 1.09, 0.282]} color="#9c8765" scale={1.15} />
      <mesh position={[0, 0.73, 0]} castShadow><cylinderGeometry args={[0.27, 0.40, 0.31, 12]} /><meshStandardMaterial color="#8d795c" /></mesh>
      {Array.from({ length: 12 }, (_, i) => <Box key={i} at={[Math.sin((i * Math.PI) / 6) * 0.36, 0.66, Math.cos((i * Math.PI) / 6) * 0.36]} size={[0.024, 0.15, 0.028]} color="#cbb998" />)}
    </>
) : (
<>
      <Ball at={[-0.045, 1.85, -0.015]} scale={[0.335, 0.13, 0.28]} color="#f1e7db" />
      <Ball at={[0, 1.778, 0.045]} scale={[0.294, 0.043, 0.262]} color="#313746" />
      <Ribbon at={[-0.26, 1.80, 0.09]} color="#272b36" scale={0.65} />
      <Ball at={[0, 1.2, -0.18]} scale={[0.265, 0.40, 0.10]} color={palette.hair} />
      {Array.from({ length: 7 }, (_, i) => <Ball key={i} at={[0.31 + (i % 2 ? -0.022 : 0.022), 1.5 - i * 0.09, 0.03]} scale={[0.042, 0.064, 0.038]} color={i % 2 ? '#aab8cd' : palette.hair} />)}
      <Ribbon at={[0.31, 0.94, 0.055]} color="#30313d" scale={0.55} />
      <Box at={[0, 1.1, 0.242]} size={[0.3, 0.42, 0.027]} color="#faf2e4" />
      {[-1, 1].map(n => <Box key={n} at={[n * 0.16, 1.14, 0.25]} size={[0.10, 0.41, 0.035]} color="#333a48" angle={n * 0.16} />)}
      <Ribbon at={[0, 1.27, 0.29]} color="#c3a57d" scale={0.7} />
      <mesh position={[0, 0.76, 0]} castShadow><cylinderGeometry args={[0.265, 0.37, 0.40, 16]} /><meshStandardMaterial color="#353746" /></mesh>
      <mesh position={[0, 0.56, 0]}><cylinderGeometry args={[0.36, 0.38, 0.055, 20]} /><meshStandardMaterial color="#eee4d7" /></mesh>
      {[-1, 1].map(n => <group key={n}><Box at={[n * 0.295, 0.87, -0.06]} size={[0.14, 0.58, 0.38]} color="#eee5d7" angle={n * 0.12} /><Ball at={[n * 0.215, 1.25, 0.235]} scale={[0.053, 0.053, 0.02]} color="#b6a37f" /></group>)}
    </>
)}
  </group>
);
}

export function GuestStyle({ kind }:{ kind:'nana' | 'azi' }) {
  const nana = kind === 'nana'; const
hair = nana ? '#79544f' : '#7663bb';
  return (
<group name={`guest-${kind}`}>
    <mesh position={[0, 1.57, -0.035]} castShadow><sphereGeometry args={[0.28, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.63]} /><meshStandardMaterial color={hair} /></mesh>
    {[-2, -1, 0, 1, 2].map(n => <Ball key={n} at={[n * 0.083, 1.705 - Math.abs(n) * 0.012, 0.19]} scale={[0.07, 0.075, 0.067]} color={hair} />)}
    {[-1, 1].map(n => (
<group key={n}>
      <Ball at={[n * 0.225, 1.29, -0.085]} scale={[0.083, 0.29, 0.09]} color={hair} />
      <Ball at={[n * 0.14, 1.43, 0.21]} scale={[0.045, 0.017, 0.017]} color="#d79995" />
      {nana ? (
<>
        <Ball at={[n * 0.26, 1.28, 0.03]} scale={[0.09, 0.11, 0.065]} color="#242b36" />
        <Ball at={[n * 0.27, 1.28, 0.07]} scale={[0.065, 0.08, 0.03]} color="#6e9cae" />
      </>
) : (
<>
        {Array.from({ length: 5 }, (_, i) => <Ball key={i} at={[n * (0.27 + (i % 2) * 0.02), 1.18 - i * 0.1, -0.05]} scale={[0.054, 0.07, 0.055]} color={i % 2 ? '#a493d7' : hair} />)}
        <Ribbon at={[n * 0.28, 0.73, -0.02]} color="#9eb36c" scale={0.65} />
      </>
)}
    </group>
))}
    <Ball at={[0, 1.465, 0.242]} scale={[0.027, 0.012, 0.012]} color="#9e635e" />
    {nana ? (
<>
      <Box at={[0, 1.14, 0.24]} size={[0.30, 0.30, 0.025]} color="#eff0e6" />
      <Ribbon at={[0, 1.28, 0.26]} color="#6696ba" scale={0.8} />
      <mesh position={[0, 0.72, 0]}><cylinderGeometry args={[0.27, 0.4, 0.28, 12]} /><meshStandardMaterial color="#747b7d" /></mesh>
      <Box at={[-0.115, 1.71, 0.23]} size={[0.11, 0.02, 0.02]} color="#d7b259" angle={-0.2} />
      <Ribbon at={[0.24, 1.72, -0.1]} color="#252c39" scale={0.8} />
      <Box at={[-0.18, 0.98, 0.25]} size={[0.04, 0.12, 0.025]} color="#ede8e1" /><Box at={[-0.18, 0.98, 0.26]} size={[0.12, 0.04, 0.025]} color="#ede8e1" />
    </>
) : (
<>
      <mesh position={[0, 1.11, -0.08]}><coneGeometry args={[0.47, 0.45, 12]} /><meshStandardMaterial color="#92a762" /></mesh>
      <Ball at={[0, 1.3, -0.17]} scale={[0.30, 0.18, 0.15]} color="#adbb72" />
      {[-1, 1].map(n => <group key={n}><Ball at={[n * 0.23, 1.39, -0.16]} scale={[0.10, 0.10, 0.09]} color="#bccc79" /><Ball at={[n * 0.23, 1.42, -0.08]} scale={[0.052, 0.055, 0.023]} color="#553e28" /></group>)}
      <Ribbon at={[0, 1.17, 0.26]} color="#ddd393" scale={0.9} />
      <mesh position={[0, 0.69, 0]}><cylinderGeometry args={[0.27, 0.39, 0.24, 14]} /><meshStandardMaterial color="#e4daba" /></mesh>
      <Box at={[-0.17, 1.71, 0.19]} size={[0.035, 0.11, 0.025]} color="#acb869" angle={0.7} />
    </>
)}
  </group>
);
}
export function GuestWeapon({ kind }:{ kind:'nana' | 'azi' }) {
  return kind === 'nana' ? (
<group name="nana-cross-pickaxe">
    <Box at={[0, 0.53, 0]} size={[0.085, 1.3, 0.085]} color="#745344" />
    <Box at={[0, 1.01, 0]} size={[0.23, 0.20, 0.17]} color="#b8c7cb" />
    {[-1, 1].map(n => (
<group key={n}>
      <Box at={[n * 0.23, 1.045, 0]} size={[0.4, 0.115, 0.13]} color="#9bb0bb" angle={n * -0.14} />
      <mesh position={[n * 0.48, 0.96, 0]} rotation={[0, 0, n * -1.98]}><coneGeometry args={[0.078, 0.40, 4]} /><meshStandardMaterial color="#d0dce0" metalness={0.65} roughness={0.3} /></mesh>
    </group>
))}
    {[0.12, 0.2, 0.28].map(y => <Box key={y} at={[0, y, 0]} size={[0.10, 0.035, 0.10]} color="#283747" />)}
  </group>
) : (
<group name="frog-bell-staff">
    <Ball at={[0, 1.06, 0]} scale={[0.19, 0.16, 0.14]} color="#9ab66a" />
    {[-1, 1].map(n => <group key={n}><Ball at={[n * 0.12, 1.2, 0]} scale={[0.075, 0.08, 0.075]} color="#c0d27d" /><Ball at={[n * 0.12, 1.21, 0.065]} scale={[0.035, 0.04, 0.02]} color="#453927" /></group>)}
    <mesh position={[0, 0.79, 0]}><coneGeometry args={[0.14, 0.22, 10]} /><meshStandardMaterial color="#d5bd68" metalness={0.55} roughness={0.3} /></mesh>
  </group>
);
}
