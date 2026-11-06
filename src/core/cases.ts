/**
 * Case studies run SQL in DuckDB (WASM in the browser, native in tests). Their data is generated
 * with this deterministic hash-based random number in [0, 1), pure integer arithmetic, so every
 * engine produces exactly the same rows. rnd(i, k): i is the row, k picks an independent stream.
 */
export const CASE_PRELUDE = [
  `CREATE OR REPLACE MACRO mix32(x) AS ((xor(x, x >> 16) * 73244475) & 4294967295)`,
  `CREATE OR REPLACE MACRO rnd(i, k) AS (
     xor(mix32(mix32((i * 2654435769 + k * 40503 + 12345) & 4294967295)),
         mix32(mix32((i * 2654435769 + k * 40503 + 12345) & 4294967295)) >> 16) / 4294967296.0)`,
] as const
