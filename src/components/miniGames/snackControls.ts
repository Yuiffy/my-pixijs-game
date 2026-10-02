import type { SnackInput } from './snackEngine';

export type SnackControlMode = 'hold' | 'toggle';
export const SNACK_CONTROL_STORAGE_KEY = 'mini-snack-controls-v1';

// Each physical key or pointer owns its hold independently. Releasing one
// source must not release another finger/key that is still down.
export class SnackControls {
  mode: SnackControlMode = 'hold';

  private sources = new Map<string, SnackInput>();

  private latched = new Set<SnackInput>();

  press(source: string, input: SnackInput) {
    if (this.sources.has(source)) return;
    this.sources.set(source, input);
    if (this.mode === 'toggle' && input !== 'eat') this.toggle(input);
  }

  release(source: string) {
    this.sources.delete(source);
  }

  releaseButtons() {
    for (const source of Array.from(this.sources.keys())) {
      if (source.startsWith('button:')) this.sources.delete(source);
    }
  }

  toggle(input: SnackInput) {
    if (this.latched.has(input)) this.latched.delete(input);
    else this.latched.add(input);
  }

  active(input: SnackInput) {
    return this.latched.has(input) ||
      ((this.mode === 'hold' || input === 'eat') &&
        Array.from(this.sources.values()).includes(input));
  }

  clear() {
    this.sources.clear();
    this.latched.clear();
  }

  setMode(mode: SnackControlMode) {
    this.clear();
    this.mode = mode;
  }
}
