import type { Action, Input, Side } from "./engine";

export type AttackStrength = "light" | "medium" | "heavy";
export interface ModernCommand {
  action: Action;
  assisted?: AttackStrength;
  chord?: boolean;
}

export const MODERN_KEYS: Record<string, [Side, Action]> = {
  KeyA: [0, "left"],
  KeyD: [0, "right"],
  KeyW: [0, "jump"],
  KeyS: [0, "crouch"],
  KeyJ: [0, "light"],
  KeyK: [0, "medium"],
  KeyL: [0, "heavy"],
  KeyU: [0, "ability"],
  KeyI: [0, "assist"],
  ArrowLeft: [1, "left"],
  ArrowRight: [1, "right"],
  ArrowUp: [1, "jump"],
  ArrowDown: [1, "crouch"],
  Digit1: [1, "light"],
  Digit2: [1, "medium"],
  Digit3: [1, "heavy"],
  Digit4: [1, "ability"],
  Digit5: [1, "assist"],
  Numpad1: [1, "light"],
  Numpad2: [1, "medium"],
  Numpad3: [1, "heavy"],
  Numpad4: [1, "ability"],
  Numpad5: [1, "assist"],
  // Optional direct shortcuts; learning them is not needed for the modern layout.
  KeyO: [0, "special"],
  KeyH: [0, "skill"],
  KeyY: [0, "rise"],
  KeyN: [0, "burst"],
  ShiftLeft: [0, "sidestep"],
  Digit6: [1, "special"],
  Digit7: [1, "skill"],
  Digit8: [1, "rise"],
  Digit9: [1, "burst"],
  Numpad6: [1, "special"],
  Numpad7: [1, "skill"],
  Numpad8: [1, "rise"],
  Numpad9: [1, "burst"],
  ShiftRight: [1, "sidestep"],
};

export const MODERN_CONTROLS: readonly [Action, string, string, string][] = [
  ["left", "←", "A", "←"],
  ["right", "→", "D", "→"],
  ["jump", "跳", "W", "↑"],
  ["crouch", "蹲", "S", "↓"],
  ["light", "轻", "J", "1"],
  ["medium", "中", "K", "2"],
  ["heavy", "重", "L", "3"],
  ["ability", "必杀", "U", "4"],
  ["assist", "辅助", "I", "5"],
];

/** Resolve chords before their normal attacks, using physical button edges. */
export function modernCommand(
  input: Input,
  previous: Input,
): ModernCommand | null {
  const chords: readonly [readonly Action[], Action][] = [
    [["assist", "ability"], "burst"],
    [["heavy", "ability"], "special"],
    [["light", "medium"], "throw"],
    [["light", "heavy"], "hold"],
    [["medium", "heavy"], "sidestep"],
  ];
  for (const [buttons, action] of chords) {
    if (buttons.every((button) => input[button])) {
      return buttons.some((button) => !previous[button])
        ? { action, chord: true }
        : null;
    }
  }
  for (const [button, action] of [
    ["light", "punch"],
    ["medium", "kick"],
    ["heavy", "heavy"],
  ] as const) {
    if (input[button] && !previous[button]) {
      return { action, assisted: input.assist ? button : undefined };
    }
  }
  return input.ability && !previous.ability
    ? { action: input.crouch ? "rise" : "skill" }
    : null;
}

export function modernGamepad(
  pad: Gamepad | null | undefined,
): [Action, boolean][] {
  const pressed = (index: number) => !!pad?.buttons[index]?.pressed;
  const x = pad?.axes[0] ?? 0;
  const y = pad?.axes[1] ?? 0;
  return [
    ["left", x < -0.35 || pressed(14)],
    ["right", x > 0.35 || pressed(15)],
    ["crouch", y > 0.35 || pressed(13)],
    ["jump", y < -0.35 || pressed(12)],
    ["light", pressed(0)],
    ["medium", pressed(2)],
    ["heavy", pressed(3)],
    ["ability", pressed(1)],
    ["assist", pressed(7)],
    ["throw", pressed(4)],
    ["special", pressed(5)],
  ];
}
