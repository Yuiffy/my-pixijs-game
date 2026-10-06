import { useLayoutEffect, useRef } from "react";

/** Keep desktop details below the HUD, including browser zoom and shell scaling. */
export function useShopDetailPosition(open: boolean, unitId: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const container = anchorRef.current?.closest<HTMLElement>(".rift-dom-layer") ?? null;
  useLayoutEffect(() => {
    const detail = ref.current;
    const card = anchorRef.current;
    const layer = card?.closest<HTMLElement>(".rift-dom-layer");
    const header = layer?.querySelector<HTMLElement>(".rift-dom-header");
    if (!open || !detail || !card || !layer) return;

    const position = () => {
      const anchor = card.getBoundingClientRect();
      const bounds = layer.getBoundingClientRect();
      // Rects include the shell transform; absolute offsets use unscaled CSS px.
      const scale = bounds.width / layer.offsetWidth || 1;
      const gap = 6 * scale;
      const topEdge = Math.max(bounds.top, header?.getBoundingClientRect().bottom ?? bounds.top) + gap;
      const bottomEdge = Math.min(bounds.bottom, window.innerHeight) - gap;
      detail.style.maxHeight = `${Math.max(1, (bottomEdge - topEdge) / scale)}px`;
      detail.style.width = `${Math.min(260, (bounds.width - 2 * gap) / scale)}px`;
      const size = detail.getBoundingClientRect();
      const top = Math.max(topEdge, Math.min(anchor.top - 5 * scale, bottomEdge - size.height));
      // Touch the card so the pointer can enter a scrollable brief without
      // crossing a gap that would dismiss hover (the shop list clips overflow).
      const left = Math.max(bounds.left + gap, anchor.left - size.width + scale);
      detail.style.top = `${(top - bounds.top) / scale}px`;
      detail.style.left = `${(left - bounds.left) / scale}px`;
      detail.style.right = "auto";
    };
    position();
    const observer = new ResizeObserver(position);
    [card, detail, layer, header].forEach(element => { if (element) observer.observe(element); });
    window.addEventListener("resize", position);
    layer.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      layer.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open, unitId]);
  return { detailRef: ref, anchorRef, container };
}
