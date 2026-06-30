/**
 * Clamp a limit parameter to a safe range.
 * Returns defaultLimit when raw is undefined or invalid, capped at maxLimit.
 */
export function clampLimit(
  raw: string | number | undefined,
  defaultLimit = 20,
  maxLimit = 100
): number {
  if (raw === undefined) return defaultLimit;
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

/**
 * Create a type guard that checks whether a value is a member of the provided Set.
 */
export function createSetGuard<T extends string>(
  validValues: Set<T>
): (value: unknown) => value is T {
  return (value: unknown): value is T => typeof value === "string" && validValues.has(value as T);
}
