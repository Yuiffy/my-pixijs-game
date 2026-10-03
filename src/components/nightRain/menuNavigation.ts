export function menuItems(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary')).filter(el => {
    if (el.hasAttribute('data-game-close') || el.getClientRects().length === 0) return false;
    // Chrome may retain layout boxes inside closed details, although they cannot receive focus.
    for (let parent = el.parentElement; parent && parent !== menu; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement && !parent.open && el !== parent.querySelector(':scope > summary')) return false;
    }
    return true;
  });
}
/** An explicit controller focus ring survives pointer input and changing React choices. */
export class MenuNavigation {
  private menu: HTMLElement | null = null;
  private key = '';
  private selected: HTMLElement | null = null;
  reset() { this.selected?.removeAttribute('data-pad-focus'); this.selected = null; this.menu = null; this.key = ''; }
  private focus(el?: HTMLElement) {
    if (!el) return;
    this.selected?.removeAttribute('data-pad-focus'); this.selected = el;
    el.setAttribute('data-pad-focus', 'true'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' });
  }
  sync(menu: HTMLElement) {
    const items = menuItems(menu); const key = menu.dataset.menuId ?? '';
    if (menu !== this.menu || key !== this.key || !items.includes(document.activeElement as HTMLElement)) this.focus(items.find(el => el.hasAttribute('data-game-primary')) ?? items[0]);
    else if (this.selected !== document.activeElement || !this.selected?.hasAttribute('data-pad-focus')) this.focus(document.activeElement as HTMLElement);
    this.menu = menu; this.key = key;
    return items;
  }
  move(menu: HTMLElement, direction: number, horizontal: boolean) {
    const items = this.sync(menu); const el = document.activeElement;
    if (horizontal && el instanceof HTMLSelectElement) {
      el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + direction)); el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (horizontal && el instanceof HTMLInputElement && el.type === 'range') {
      const value = String(Math.max(Number(el.min || 0), Math.min(Number(el.max || 100), Number(el.value) + direction * Number(el.step || 1))));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const index = items.indexOf(el as HTMLElement); this.focus(items[(index + direction + items.length) % items.length]);
    }
  }
  confirm(menu: HTMLElement) {
    this.sync(menu); const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === 'range') return;
    if (!(el instanceof HTMLSelectElement) && el instanceof HTMLElement) el.click();
  }
}
