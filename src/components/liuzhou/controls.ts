import type { CameraRig } from "./Scene";

// At 100% sensitivity this is 44 degrees in a single mouse sample.
// Cursor recentering/lock transitions can report a screen-sized displacement.
// Drop those samples rather than turning the camera or replaying them later.
// There is no frame-level cap: a fast turn made of normal samples stays intact.
const MAX_LOCKED_MOUSE_DELTA = 256;

type Host = {
  root: HTMLElement;
  rig: CameraRig;
  playing: () => boolean;
  pause: () => void;
  clear: () => void;
  changed: () => void;
  sensitivity?: () => number;
};

/** Mouse capture follows the same lifecycle as Night Rain's ActionControls. */
export class StreetControls {
  locked = false;
  message = "";
  altHeld = false;
  touch = false;
  private requesting = false;
  private intentionalRelease = false;
  private captureAfterRelease = false;
  private disposed = false;
  private escapedAt = -Infinity;
  private removers: (() => void)[] = [];

  constructor(private host: Host) {
    const on = <K extends keyof DocumentEventMap>(type: K, listener: (event: DocumentEventMap[K]) => void) => {
      document.addEventListener(type, listener);
      this.removers.push(() => document.removeEventListener(type, listener));
    };
    on("pointerlockchange", () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === host.root;
      this.requesting = false;
      if (this.locked) {
        this.message = "";
        if (!host.playing() || this.altHeld) this.release();
      } else {
        if (wasLocked && !this.intentionalRelease) {
          this.escapedAt = performance.now();
          host.pause();
        }
        this.intentionalRelease = false;
        if (this.captureAfterRelease) this.capture();
      }
      host.changed();
    });
    on("pointerlockerror", () => this.failed());
    on("mousemove", event => {
      if (!this.locked || !host.playing() || this.altHeld) return;
      const { movementX: x, movementY: y } = event;
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > MAX_LOCKED_MOUSE_DELTA || Math.abs(y) > MAX_LOCKED_MOUSE_DELTA) return;
      this.look(x, y);
    });
    on("pointerdown", event => {
      if (host.root.contains(event.target as Node)) this.touch = event.pointerType === "touch";
    });
    on("keydown", event => {
      if (event.key !== "Alt") return;
      event.preventDefault();
      this.altHeld = true;
      this.captureAfterRelease = false;
      host.clear();
      this.release();
    });
    on("keyup", event => {
      if (event.key !== "Alt") return;
      event.preventDefault();
      this.altHeld = false;
      this.captureAfterRelease = true;
      this.capture();
    });
  }

  look(x: number, y: number, mouse = true) {
    const sensitivity = mouse ? this.host.sensitivity?.() ?? 1 : 1;
    this.host.rig.yaw -= x * 0.003 * sensitivity;
    this.host.rig.pitch = Math.max(-0.65, Math.min(0.95, this.host.rig.pitch + y * 0.003 * sensitivity));
    this.host.rig.dragged = performance.now();
  }

  capture() {
    if (this.disposed || !this.host.playing() || this.altHeld || this.touch || matchMedia("(pointer: coarse)").matches || this.requesting) return;
    if (document.pointerLockElement === this.host.root) {
      if (this.intentionalRelease) this.captureAfterRelease = true;
      return;
    }
    this.captureAfterRelease = false;
    this.host.root.focus({ preventScroll: true });
    if (!this.host.root.requestPointerLock) { this.failed(); return; }
    const request = async (raw: boolean): Promise<void> => {
      this.requesting = true;
      // Prefer raw relative motion without OS pointer acceleration where
      // supported. Older implementations still use ordinary lock.
      try {
        await this.host.root.requestPointerLock(raw ? { unadjustedMovement: true } : undefined);
        if (this.disposed && document.pointerLockElement === this.host.root) document.exitPointerLock();
      } catch (error) {
        if (this.disposed) return;
        if (raw && error instanceof Error && error.name === "NotSupportedError" && this.host.playing() && !this.altHeld && !this.touch) {
          await request(false);
        } else this.failed();
      }
    };
    request(true);
  }

  release() {
    if (document.pointerLockElement === this.host.root) {
      this.intentionalRelease = true;
      document.exitPointerLock();
    }
  }

  blur() {
    this.altHeld = false;
    this.captureAfterRelease = false;
    this.release();
  }

  // Chrome may deliver Escape as a key event, a lock-change event, or both.
  justEscaped() { return performance.now() - this.escapedAt < 200; }
  private failed() {
    this.requesting = false;
    this.message = "点击画面捕获鼠标；若浏览器不支持，可按住鼠标拖动视角";
    this.host.changed();
  }
  dispose() {
    this.disposed = true;
    this.captureAfterRelease = false;
    this.release();
    this.removers.forEach(remove => remove());
  }
}
