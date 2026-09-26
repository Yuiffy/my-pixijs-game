import { SkinId, skinOf } from "./skins";

type Vec = [number, number, number];
function Orb({ at, scale, color }: { at: Vec; scale: Vec; color: string }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>;
}
function Stripe({ at, size, color, tilt = 0 }: { at: Vec; size: Vec; color: string; tilt?: number }) {
  return <mesh position={at} rotation={[0, 0, tilt]} castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}

/** Lightweight costume pieces share the existing head/body rig and animations. */
export function SkinDetails({ id, part }: { id: SkinId; part: "head" | "body" }) {
  const skin = skinOf(id);
  if (id === "host") return null;
  if (part === "body") return (
<group>
    <Stripe at={[0, 0.85, 0.158]} size={[0.18, 0.29, 0.018]} color={id === "sui" ? skin.dark : "#eee9df"} />
    {[-1, 1].map(sign => (
<group key={sign}>
      <Stripe at={[sign * 0.114, 0.88, 0.155]} size={[0.04, 0.28, 0.025]} color={skin.accent} tilt={sign * -0.18} />
      <Orb at={[sign * 0.052, 1.01, 0.15]} scale={[0.065, 0.025, 0.025]} color={id === "sui" ? skin.dark : skin.accent} />
    </group>
))}
    <Orb at={[0, 1.005, 0.178]} scale={[0.021, 0.023, 0.012]} color={id === "sui" ? "#d3c1df" : "#356387"} />
    {id === "nana7mi" && (
<group>
      <Orb at={[0, 1.04, -0.09]} scale={[0.245, 0.13, 0.12]} color={skin.outfit} />
      {[-2, -1, 0, 1, 2].map(n => <mesh key={n} position={[n * 0.056, 1.145 - Math.abs(n) * 0.01, -0.065]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.021, 0.045, 3]} /><meshStandardMaterial color="#f6f1e7" /></mesh>)}
    </group>
)}
  </group>
);
  return (
<group>
    {id === "sui" ? (
<>
      {[-1, 1].map(sign => (
<group key={sign}>
        {[0, 1, 2, 3].map(n => <Orb key={n} at={[sign * (0.24 + Math.sin(n * 1.4) * 0.025), -0.025 - n * 0.083, -0.065]} scale={[0.077 - n * 0.008, 0.09, 0.069]} color={n % 2 ? "#bab3d5" : skin.hair} />)}
        <Orb at={[sign * 0.24, 0.025, 0]} scale={[0.09, 0.023, 0.031]} color={skin.dark} />
        <Orb at={[sign * 0.24, 0.025, 0]} scale={[0.022, 0.08, 0.026]} color={skin.dark} />
      </group>
))}
      <Orb at={[0, 0.172, -0.017]} scale={[0.224, 0.095, 0.19]} color={skin.dark} />
      <Orb at={[0, 0.142, 0.155]} scale={[0.222, 0.025, 0.11]} color="#484158" />
      {[-1, 1].map(sign => (
<group key={sign} position={[sign * 0.153, 0.276, -0.023]} rotation={[0, 0, sign * -0.22]}>
        <mesh><coneGeometry args={[0.075, 0.145, 3]} /><meshStandardMaterial color={skin.dark} /></mesh>
        <mesh position={[0, 0, 0.039]}><coneGeometry args={[0.042, 0.092, 3]} /><meshStandardMaterial color={skin.accent} /></mesh>
      </group>
))}
      <mesh position={[0, 0.41, -0.025]} rotation={[1.32, 0.18, 0]}><torusGeometry args={[0.26, 0.008, 5, 32]} /><meshStandardMaterial color="#bba479" metalness={0.35} roughness={0.5} /></mesh>
      <Stripe at={[-0.075, 0.187, 0.168]} size={[0.055, 0.01, 0.01]} color="#b2d5e5" tilt={-0.35} />
    </>
) : (
<>
      {[-1, 1].map(sign => (
<group key={sign}>
        <Orb at={[sign * 0.172, -0.2, -0.087]} scale={[0.088, 0.27, 0.083]} color={skin.hair} />
        <Orb at={[sign * 0.192, 0.013, -0.012]} scale={[0.072, 0.024, 0.04]} color={skin.dark} />
        <Orb at={[sign * 0.192, 0.013, -0.012]} scale={[0.022, 0.068, 0.04]} color={skin.dark} />
      </group>
))}
      <Stripe at={[0.112, 0.096, 0.171]} size={[0.075, 0.013, 0.012]} color="#e3bf65" tilt={-0.15} />
      <Stripe at={[0.118, 0.071, 0.174]} size={[0.068, 0.01, 0.012]} color="#e3bf65" tilt={-0.15} />
      {[-1, 1].map(sign => <Stripe key={sign} at={[-0.118, 0.07, 0.175]} size={[0.056, 0.01, 0.012]} color="#d6e6e6" tilt={sign * 0.65} />)}
    </>
)}
  </group>
);
}

export function SkinPortrait({ id }: { id: SkinId }) {
  const s = skinOf(id);
  return (
<svg viewBox="0 0 100 92" aria-hidden="true">
    <ellipse cx="50" cy="83" rx="33" ry="25" fill={s.outfit} />
    <path d="M22 57V34C22 1 78 1 78 34v39H22" fill={s.hair} />
    {id === "sui" && <g fill={s.hair}><ellipse cx="17" cy="53" rx="10" ry="25" /><ellipse cx="83" cy="53" rx="10" ry="25" /></g>}
    <ellipse cx="50" cy="42" rx="23" ry="28" fill="#f4d4be" />
    <path d="M26 27Q50 2 74 28L66 37 53 28 47 39 37 30 27 37Z" fill={s.hair} />
    <g fill={s.eyes}><ellipse cx="40" cy="45" rx="3.7" ry="5" /><ellipse cx="60" cy="45" rx="3.7" ry="5" /></g>
    <g fill="#fff8ef"><circle cx="39" cy="43" r="1.4" /><circle cx="59" cy="43" r="1.4" /></g>
    <path d="M45 57q5 5 10 0" fill="none" stroke="#a86c70" strokeWidth="2" />
    {id === "sui" && <g><path d="M24 24L23 3 38 14Q52 5 65 14L78 3 78 28Z" fill={s.dark} /><path d="M28 14L28 8 34 16M69 16L74 8 74 15" stroke={s.accent} strokeWidth="4" /><ellipse cx="51" cy="27" rx="31" ry="6" fill="#4c435d" /></g>}
    {id === "nana7mi" && <g><path d="M61 28l13 -2m-13 7 13 -2" stroke="#e3bf65" strokeWidth="3" /><path d="M24 30l8 6m-8 0 8 -6" stroke="#d6e6e6" strokeWidth="2" /><path d="M36 72l14 6 14 -6 -4 15 -10 -7 -10 7Z" fill={s.accent} /></g>}
  </svg>
);
}
