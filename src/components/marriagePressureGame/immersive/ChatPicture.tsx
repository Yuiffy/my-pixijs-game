"use client";

import { useId } from "react";
import styles from "./immersive.module.css";

// Small, local illustrations; the semantic subject can later select generated photos.
export default function ChatPicture({ subject }: { subject: string }) {
  const id = useId().replace(/:/g, "");
  const kind = /猫/.test(subject) ? "cat" : /饭|肉|鸡|吃|火锅|餐|蛋|冰箱|厨/.test(subject) ? "food" : /单|表|报名/.test(subject) ? "paper" : /婚|满月|宝宝|孙|视频/.test(subject) ? "party" : /办公室|入职|上岸/.test(subject) ? "work" : "view";
  return (
    <figure className={styles.chatPicture} data-testid="chat-picture" data-subject={kind}>
      <svg viewBox="0 0 240 160" role="img" aria-label={subject}>
        <defs><linearGradient id={id} x2="0.8" y2="1"><stop stopColor="#ead6b8" /><stop offset="1" stopColor="#b7cec6" /></linearGradient></defs>
        <rect width="240" height="160" rx="8" fill={`url(#${id})`} />
        {kind === "food" && (
<>
          <path d="M0 32H240M0 80H240M0 132H240" stroke="#bca484" strokeWidth="2" />
          <ellipse cx="117" cy="94" rx="80" ry="49" fill="#8b7565" opacity=".18" />
          <ellipse cx="112" cy="82" rx="78" ry="48" fill="#faf6eb" />
          <ellipse cx="112" cy="82" rx="67" ry="39" fill="#dbebdc" />
          <ellipse cx="79" cy="81" rx="29" ry="28" fill="#fffaf1" />
          {[0, 1, 2, 3, 4, 5].map(n => <g key={n} transform={`translate(${117 + (n % 3) * 19} ${62 + Math.floor(n / 3) * 26}) rotate(${n * 13})`}><rect width="20" height="21" rx="6" fill={n % 2 ? "#b96932" : "#cf8446"} /><path d="M3 5L16 5" stroke="#edb363" strokeWidth="3" /></g>)}
          <path d="M118 111q7-23 17-9t22-3" fill="none" stroke="#549563" strokeWidth="9" />
          <path d="M209 35L199 138M222 37L209 140" stroke="#74513e" strokeWidth="4" />
        </>
)}
        {kind === "cat" && (
<>
          <rect y="112" width="240" height="48" fill="#91a79c" />
          <ellipse cx="120" cy="111" rx="54" ry="31" fill="#dc9a51" />
          <path d="M78 70L77 26L105 48M135 48L163 26L159 74" fill="#d48a45" />
          <ellipse cx="120" cy="76" rx="45" ry="36" fill="#ecb269" />
          <path d="M99 72l10 3M133 75l10-3" stroke="#4e4238" strokeWidth="4" strokeLinecap="round" />
          <path d="M115 85h10l-5 6z" fill="#b67668" /><path d="M120 91q-10 8-15 0m15 0q10 8 15 0" fill="none" stroke="#795243" strokeWidth="2" />
          <path d="M108 43l3 15m10-17v17m11-14l-4 15M172 120q39-27 25-46" fill="none" stroke="#b6783d" strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="102" cy="129" rx="17" ry="10" fill="#f5d4a0" /><ellipse cx="139" cy="129" rx="17" ry="10" fill="#f5d4a0" />
        </>
)}
        {kind === "paper" && (
<>
          <rect x="52" y="13" width="139" height="140" rx="4" fill="#a99f8f" opacity=".2" />
          <rect x="48" y="9" width="139" height="140" rx="4" fill="#fffdf5" />
          <rect x="63" y="25" width="75" height="9" rx="2" fill="#4b827c" />
          {[48, 65, 82, 99, 116].map(y => <path key={y} d={`M63 ${y}H171`} stroke="#ccd4ca" strokeWidth="3" />)}
          <circle cx="155" cy="120" r="15" fill="none" stroke="#bf6f63" strokeWidth="2" /><path d="M145 120l7 6 14-15" fill="none" stroke="#bf6f63" strokeWidth="2" />
        </>
)}
        {kind === "party" && (
<>
          <rect width="240" height="160" fill="#eed4cc" />
          {[35, 80, 165, 208].map((x, n) => <g key={x}><ellipse cx={x} cy={32 + (n % 2) * 12} rx="16" ry="22" fill={n % 2 ? "#d89c53" : "#c46b77"} /><path d={`M${x} ${54 + (n % 2) * 12}q-12 25 0 43`} fill="none" stroke="#b39283" /></g>)}
          <ellipse cx="120" cy="140" rx="70" ry="12" fill="#af8b7d" opacity=".3" />
          <rect x="69" y="103" width="103" height="33" rx="8" fill="#fcf5e2" /><rect x="88" y="78" width="65" height="28" rx="6" fill="#fff9ee" />
          <path d="M94 79q27-22 53 0" fill="#cf7880" /><path d="M120 63V48" stroke="#c38d46" strokeWidth="4" /><ellipse cx="120" cy="43" rx="4" ry="7" fill="#edb54a" />
        </>
)}
        {(kind === "view" || kind === "work") && (
<>
          <rect width="240" height="160" fill="#e6b59e" /><circle cx="167" cy="43" r="23" fill="#ffdfac" />
          {[0, 28, 58, 88, 178, 210].map((x, n) => <g key={x}><rect x={x} y={55 + (n % 3) * 12} width="25" height="72" fill={n % 2 ? "#718f94" : "#506e81"} /><path d={`M${x + 7} 85v22m10-22v22`} stroke="#e7d7b8" strokeWidth="3" /></g>)}
          <path d="M0 121Q104 98 240 120V160H0Z" fill="#719ea7" /><path d="M90 132h70m-56 10h81m-60 10h43" stroke="#f1d6ad" strokeWidth="3" />
          {kind === "work" && <><path d="M12 0v160M220 0v160M0 112H240" stroke="#414f58" strokeWidth="9" /><rect x="56" y="94" width="101" height="53" rx="4" fill="#344c5b" /><path d="M69 109h64m-64 10h45m-45 10h58" stroke="#90bfb8" strokeWidth="3" /></>}
        </>
)}
      </svg>
      <figcaption>{subject}</figcaption>
    </figure>
  );
}
