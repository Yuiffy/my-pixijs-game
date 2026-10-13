import Image from "next/image";
import { useEffect, useRef } from "react";
import { CGS, CgId, cgOf } from "./cg";
import { skinOf } from "./skins";
import styles from "./cg.module.css";

export default function CgGallery({ selected, unlocked, onSelect, onClose, fresh = false }: {
  selected: CgId | "album"; unlocked: CgId[]; onSelect: (id: CgId | "album") => void; onClose: () => void; fresh?: boolean;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = panel.current;
    dialog?.showModal();
    dialog?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const buttons = dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      const first = buttons.item(0);
      const last = buttons.item(buttons.length - 1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    dialog?.addEventListener("keydown", trapFocus);
    return () => { dialog?.removeEventListener("keydown", trapFocus); dialog?.close(); previous?.focus(); };
  }, []);
  const cg = selected === "album" ? null : cgOf(selected);
  return (
<dialog
ref={panel}
tabIndex={-1}
aria-modal="true"
aria-label={cg ? `回忆CG：${cg.title}` : "回忆相册"}
    className={styles.overlay}
onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className={styles.sheet}>
      <header><div><small>{fresh ? "NEW MEMORY / 新回忆" : "OUR LITTLE MOMENTS / 回忆相册"}</small><h2>{cg?.title ?? "普通的夜晚，也值得收藏。"}</h2></div><button onClick={onClose}>{fresh ? "收好回忆，继续 →" : "关闭相册"}</button></header>
      {cg ? <><figure><Image src={`/images/hush-live/cg/${cg.id}.webp`} alt={`${skinOf(cg.skin).name} · ${cg.title}`} width={1536} height={864} priority unoptimized /><figcaption>{cg.text}</figcaption></figure><footer><span>{skinOf(cg.skin).name} · 已收藏</span><button onClick={() => onSelect("album")}>查看回忆相册</button></footer></>
        : (
<><p className={styles.intro}>已收藏 {unlocked.length} / {CGS.length} · 未解锁的回忆会显示触发线索。</p><div className={styles.grid}>{CGS.map(item => {
          const open = unlocked.includes(item.id);
          return (
<button key={item.id} className={styles.card} disabled={!open} onClick={() => onSelect(item.id)} aria-label={`${item.title} · ${open ? "已解锁" : "未解锁"}`}>
            {open ? <Image src={`/images/hush-live/cg/${item.id}.webp`} alt="" width={480} height={270} unoptimized /> : <div className={styles.locked}><span>◇</span><small>尚未遇见</small></div>}
            <strong>{skinOf(item.skin).name} · {item.title}</strong><span>{open ? "点击重看" : item.hint}</span>
          </button>
);
        })}</div></>
)}
    </div>
  </dialog>
);
}
