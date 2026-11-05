/** Merge plain-object `patch` into `base` recursively (arrays and values replace). For nested lab presets. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return (patch === undefined ? base : patch) as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v)
  return out as T
}
