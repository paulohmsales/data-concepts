import { useCallback, useEffect, useRef, useState } from 'react'
import { Sandbox, type View } from './sandbox.ts'

/**
 * Owns the sandbox for the page: boots DuckDB-WASM, runs one action at a time, and re-reads the
 * view after each. `asOf` is the "what did we know at T" tick.
 */
export function useSandbox() {
  const ref = useRef<Sandbox | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOfState] = useState(1)
  const asOfRef = useRef(1)

  const refresh = useCallback(async () => {
    const s = ref.current
    if (!s) return
    setView(await s.read(asOfRef.current))
  }, [])

  useEffect(() => {
    const effect = { cancelled: false }
    const dbPromise = import('../../lib/duckdbWasm.ts').then((m) => m.wasmDb())
    dbPromise
      .then(async (db) => {
        if (effect.cancelled) return
        const s = new Sandbox(db)
        await s.reset()
        ref.current = s
        await refresh()
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
    return () => {
      effect.cancelled = true
      ref.current = null
      void dbPromise.then((db) => db.close()).catch(() => {})
    }
  }, [refresh])

  /** Run an action against the sandbox, then refresh. Ignored while another action runs. */
  const run = useCallback(
    async (action: (s: Sandbox) => Promise<void>, nextAsOf?: (s: Sandbox) => number) => {
      const s = ref.current
      if (!s) return
      setBusy(true)
      try {
        await action(s)
        // Follow the clock unless the caller pins T.
        asOfRef.current = nextAsOf ? nextAsOf(s) : Math.max(1, s.now - 1)
        setAsOfState(asOfRef.current)
        await refresh()
        setError(null)
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const setAsOf = useCallback(
    (t: number) => {
      asOfRef.current = t
      setAsOfState(t)
      void refresh()
    },
    [refresh],
  )

  return { view, busy, error, run, asOf, setAsOf }
}
