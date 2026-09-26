import type { CameraControl, GameInput, GameState } from './types';

type Panel = 'pause' | 'map' | 'companion' | null;
type ControlHost = {
  root: HTMLElement;
  camera: { current: CameraControl };
  state: () => GameState;
  panel: () => Panel;
  confirming: () => boolean;
  cancelConfirm: () => void;
  showPanel: (panel: Panel) => void;
  clear: () => void;
  queue: (action: Partial<GameInput>) => void;
  upgrade: () => void;
};

/** Radial dead zone preserves walking speed and prevents faster diagonals. */
export function stick(x = 0, y = 0, deadzone = 0.18) {
  const safe = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  const sx = safe(x); const sy = safe(y); const length = Math.hypot(sx, sy);
  const amount = Math.max(0, Math.min(1, (length - deadzone) / (1 - deadzone)));
  return amount ? { x: (sx / length) * amount, y: (sy / length) * amount } : { x: 0, y: 0 };
}

/** Browser devices feed ordinary game inputs; they never edit simulation state. */
export class ActionControls {
  movement = { x: 0, forward: 0, sprint: false };
  source: 'mouse' | 'gamepad' | 'touch' = 'mouse';
  locked = false;
  altHeld = false;
  gamepadConnected = false;
  lockMessage = '';
  lookSettings = { mouse: 1, gamepad: 1, invertY: false };
  private sprinting = false;
  private focused = true;
  private disposed = false;
  private intentionalRelease = false;
  private requesting = false;
  private captureAfterRelease = false;
  private padKey = '';
  private previous: boolean[] = [];
  private navigation = 0;
  private nextNavigation = 0;
  private listeners: (() => void)[] = [];

  constructor(private host: ControlHost) {
    try {
      const settings = JSON.parse(localStorage.getItem('night-rain-v1-controls') ?? '{}');
      for (const key of ['mouse', 'gamepad'] as const) if ([0.6, 1, 1.5, 2].includes(settings?.[key])) this.lookSettings[key] = settings[key];
      this.lookSettings.invertY = settings?.invertY === true;
    } catch { /* Defaults also work without local storage. */ }
    const on = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void) => {
      document.addEventListener(type, handler);
      this.listeners.push(() => document.removeEventListener(type, handler));
    };
    on('pointerlockchange', () => {
      const wasLocked = this.locked;
      // A fast Alt tap can release the lock before its acquisition event is delivered.
      this.requesting = false;
      this.locked = document.pointerLockElement === host.root;
      if (this.locked) {
        this.requesting = false;
        if (!this.playing() || this.altHeld || !this.focused) { this.release(); return; }
        this.source = 'mouse'; this.lockMessage = '';
      } else {
        if (wasLocked && !this.intentionalRelease && this.playing()) host.showPanel('pause');
        this.intentionalRelease = false;
        if (this.captureAfterRelease) this.capture();
      }
    });
    on('pointerlockerror', () => { this.requesting = false; this.lockMessage = '点击画面重新捕获鼠标'; });
    on('mousemove', event => {
      if (!this.locked || this.altHeld || !this.playing()) return;
      this.look(event.movementX * 0.003 * this.lookSettings.mouse, event.movementY * 0.003 * this.lookSettings.mouse);
    });
    on('mousedown', event => {
      if (!this.locked || this.altHeld || !this.playing()) return;
      event.preventDefault();
      if (event.button === 0) host.queue({ light: true });
      if (event.button === 2) host.queue({ heavy: true });
      if (event.button === 1) host.queue({ lock: true });
    });
    on('contextmenu', event => { if (this.locked) event.preventDefault(); });
    on('wheel', event => { if (this.locked && this.playing()) this.host.camera.current.distance = Math.max(3, Math.min(9, this.host.camera.current.distance + event.deltaY * 0.006)); });
    on('keydown', event => {
      if (event.key !== 'Alt') return;
      event.preventDefault();
      this.altHeld = true; this.captureAfterRelease = false; host.clear(); this.release();
    });
    on('keyup', event => {
      if (event.key !== 'Alt') return;
      event.preventDefault(); this.altHeld = false;
      if (this.source === 'mouse' && this.focused && this.playing()) { this.captureAfterRelease = true; this.capture(); }
    });
    const blur = () => { this.focused = false; this.altHeld = false; this.captureAfterRelease = false; this.movement = { x: 0, forward: 0, sprint: false }; this.release(); };
    const focus = () => { this.focused = true; };
    window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    this.listeners.push(() => { window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); });
  }

  private playing() { const s = this.host.state(); return s.mode === 'playing' && !s.paused && !this.host.panel() && !this.host.confirming(); }
  private look(x: number, y: number) {
    this.host.camera.current.yaw -= x;
    this.host.camera.current.pitch = Math.max(0.14, Math.min(1.15, this.host.camera.current.pitch + y * (this.lookSettings.invertY ? -1 : 1)));
  }
  setLook(settings: Partial<typeof this.lookSettings>) {
    this.lookSettings = { ...this.lookSettings, ...settings };
    try { localStorage.setItem('night-rain-v1-controls', JSON.stringify(this.lookSettings)); } catch { /* Session settings remain usable. */ }
  }
  capture() {
    if (this.disposed || !this.playing() || this.altHeld || this.locked || this.requesting || this.source === 'gamepad' || matchMedia('(pointer: coarse)').matches) return;
    this.host.root.focus({ preventScroll: true });
    if (!this.host.root.requestPointerLock) { this.lockMessage = '浏览器不支持鼠标捕获，可用手柄或触屏'; return; }
    this.requesting = true;
    this.captureAfterRelease = false;
    try {
      // Promise in modern browsers, void in older implementations.
      const result = this.host.root.requestPointerLock() as Promise<void> | undefined;
      result?.then(() => { if (this.disposed && document.pointerLockElement === this.host.root) document.exitPointerLock(); }).catch(() => { this.requesting = false; if (!this.disposed) this.lockMessage = '点击画面重新捕获鼠标'; });
    } catch { this.requesting = false; this.lockMessage = '点击画面重新捕获鼠标'; }
  }
  release() {
    this.sprinting = false;
    this.movement = { x: 0, forward: 0, sprint: false };
    if (document.pointerLockElement === this.host.root) { this.intentionalRelease = true; document.exitPointerLock(); }
  }
  touch() { this.source = 'touch'; }
  mouse() { this.source = 'mouse'; this.capture(); }

  poll(ms: number, now: number) {
    this.movement = { x: 0, forward: 0, sprint: false };
    let pads: (Gamepad | null)[] = [];
    try { pads = Array.from(navigator.getGamepads?.() ?? []); } catch { /* Keyboard/touch remain usable when denied by browser policy. */ }
    const supported = pads.filter((p): p is Gamepad => !!p && p.connected && p.mapping === 'standard');
    const active = (p: Gamepad) => p.buttons.some(b => b.pressed || b.value > 0.5) || Math.hypot(p.axes[0] ?? 0, p.axes[1] ?? 0) > 0.18 || Math.hypot(p.axes[2] ?? 0, p.axes[3] ?? 0) > 0.18;
    const pad = supported.find(p => active(p) && `${p.index}:${p.id}` !== this.padKey) ?? supported.find(p => `${p.index}:${p.id}` === this.padKey) ?? supported[0];
    this.gamepadConnected = !!pad;
    if (!pad) {
      if (this.padKey && this.source === 'gamepad' && this.playing()) { this.host.clear(); this.host.showPanel('pause'); }
      this.padKey = ''; this.previous = []; return;
    }
    const pressed = pad.buttons.map(b => b.pressed || b.value > 0.5);
    const key = `${pad.index}:${pad.id}`;
    // Reconnect/focus regain never replays buttons held in the background.
    if (key !== this.padKey || !this.focused || document.hidden) {
      this.padKey = key; this.previous = pressed; this.navigation = 0; return;
    }
    const { previous } = this;
    const edge = (index: number) => !!pressed[index] && !previous[index];
    const move = stick(pad.axes[0], pad.axes[1]); const look = stick(pad.axes[2], pad.axes[3]);
    this.previous = pressed;
    if (active(pad)) { this.source = 'gamepad'; if (this.locked) this.release(); }
    if (this.host.confirming()) {
      if (edge(1)) { this.host.cancelConfirm(); return; }
    } else if (this.host.state().mode === 'playing' && edge(9)) {
      this.host.showPanel(this.host.panel() ? null : 'pause'); return;
    }
    const menu = this.host.root.querySelector<HTMLElement>('[role="alertdialog"]') ?? this.host.root.querySelector<HTMLElement>('[role="dialog"]') ?? this.host.root.querySelector<HTMLElement>('[data-game-menu]');
    if (menu) {
      if (edge(1) && this.host.panel() && !this.host.confirming()) { this.host.showPanel(null); return; }
      const items = Array.from(menu.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary')).filter(el => el.getClientRects().length > 0);
      const direction = pressed[12] || pressed[14] || move.y < -0.5 || move.x < -0.5 ? -1 : pressed[13] || pressed[15] || move.y > 0.5 || move.x > 0.5 ? 1 : 0;
      if (direction && (direction !== this.navigation || now > this.nextNavigation)) {
        const focused = document.activeElement;
        if (focused instanceof HTMLSelectElement && (pressed[14] || pressed[15] || Math.abs(move.x) > 0.5)) {
          focused.selectedIndex = Math.max(0, Math.min(focused.options.length - 1, focused.selectedIndex + direction));
          focused.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          const index = items.indexOf(focused as HTMLElement);
          const next = index < 0 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length;
          items[next]?.focus(); items[next]?.scrollIntoView({ block: 'nearest' });
        }
        this.nextNavigation = now + (direction !== this.navigation ? 350 : 150);
      }
      this.navigation = direction;
      if (edge(0)) {
        const focused = items.find(el => el === document.activeElement);
        // First confirm on a title/death screen selects its primary action.
        (focused ?? menu.querySelector<HTMLElement>('[data-game-primary]') ?? items[0])?.click();
      }
      return;
    }
    this.navigation = 0;
    if (!this.playing() || this.altHeld) return;
    if (edge(8)) { this.host.showPanel('map'); return; }
    if (edge(3)) { this.host.showPanel('companion'); return; }
    if (edge(12)) this.host.upgrade();
    if (edge(10)) this.sprinting = !this.sprinting;
    if (Math.hypot(move.x, move.y) < 0.1) this.sprinting = false;
    this.movement = { x: move.x, forward: -move.y, sprint: this.sprinting };
    this.look(look.x * ms * 0.0024 * this.lookSettings.gamepad, look.y * ms * 0.0018 * this.lookSettings.gamepad);
    const bindings = { interact: 0, dodge: 1, heal: 2, parry: 4, light: 5, heavy: 7, lock: 11 };
    for (const [action, index] of Object.entries(bindings)) if (edge(index)) this.host.queue({ [action]: true });
  }

  dispose() { this.disposed = true; this.release(); this.listeners.forEach(remove => remove()); }
}
