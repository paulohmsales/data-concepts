import { useEffect, useState } from 'react'
import type { Db } from '../core/db.ts'

/**
 * Boots DuckDB-WASM (lazily, shared across the page), opens a connection, and creates this module's
 * tables inside its own schema so modules never see each other's tables. Re-running setup on mount
 * resets the data, so every visit starts clean.
 */
// Setups run one after another, so a remount (or React's dev double-mount) never races an
// unfinished setup that is replacing the same tables.
let setupChain: Promise<unknown> = Promise.resolve()

export function useDuckSchema(schema: string, setup: readonly string[]) {
  const [db, setDb] = useState<Db | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const effect = { cancelled: false }
    const conn = import('./duckdbWasm.ts').then((m) => m.wasmDb())
    const ready = (setupChain = setupChain.then(() =>
      conn.then(async (c) => {
        if (effect.cancelled) return
        await c.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
        await c.run(`SET search_path = '${schema}'`)
        for (const sql of setup) {
          if (effect.cancelled) return
          await c.run(sql)
        }
        if (!effect.cancelled) setDb(c)
      }),
    ).catch((e) => setError(String(e))))
    void ready
    return () => {
      effect.cancelled = true
      void conn.then((c) => c.close()).catch(() => {})
    }
  }, [schema, setup])

  return { db, error }
}
