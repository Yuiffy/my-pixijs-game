export const LOOK_SENSITIVITY_KEY = "liuzhou-look-sensitivity";
export const DEFAULT_LOOK_SENSITIVITY = 0.6;
export const MIN_LOOK_SENSITIVITY = 0.2;
export const MAX_LOOK_SENSITIVITY = 2;

export function normalizeLookSensitivity(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_LOOK_SENSITIVITY, Math.min(MAX_LOOK_SENSITIVITY, value))
    : DEFAULT_LOOK_SENSITIVITY;
}
