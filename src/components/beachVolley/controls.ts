import { emptyInput } from './engine';
import type { Action, Input, Side } from './engine';

// Each physical key or pointer owns its press until release or cancellation.
export function createControls() {
  const held = new Map<string, [Side, Action]>();
  const inputs: [Input, Input] = [emptyInput(), emptyInput()];
  const release = (source: string) => {
    const binding = held.get(source);
    if (!binding) return;
    held.delete(source);
    const [side, action] = binding;
    inputs[side][action] = Array.from(held.values()).some(
      ([s, a]) => s === side && a === action,
    );
  };
  return {
    inputs,
    press(source: string, side: Side, action: Action) {
      if (held.has(source)) return;
      held.set(source, [side, action]);
      inputs[side][action] = true;
    },
    release,
    clear() {
      held.clear();
      inputs[0] = emptyInput();
      inputs[1] = emptyInput();
    },
  };
}
