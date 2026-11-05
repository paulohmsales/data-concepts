import { useEffect, useRef, useState } from 'react'

/** Personal notes and experiment predictions for one module, stored per login on the server. */
export type Rating = 'right' | 'partly' | 'wrong'
export interface Prediction {
  text: string
  rating: Rating | null
}
export interface Entries {
  note: string
  predictions: Record<string, Prediction>
}

const EMPTY: Entries = { note: '', predictions: {} }

export function saveEntry(slug: string, body: { kind: 'note' | 'prediction'; item?: number; text: string; rating?: Rating | null }) {
  return fetch(`/api/progress/${encodeURIComponent(slug)}/entries`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: 0, rating: null, ...body }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`)
  })
}

export function loadEntries(slug: string): Promise<Entries> {
  return fetch(`/api/progress/${encodeURIComponent(slug)}/entries`)
    .then((r) => (r.ok ? r.json() : EMPTY))
    .catch(() => EMPTY)
}

/** Loads a module's entries; `setPrediction` updates locally at once and saves in the background. */
export function useEntries(slug: string | undefined) {
  const [entries, setEntries] = useState<Entries>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!slug) return
    const effect = { cancelled: false }
    loadEntries(slug).then((e) => {
      if (effect.cancelled) return
      setEntries(e)
      setLoaded(true)
    })
    return () => {
      effect.cancelled = true
    }
  }, [slug])
  const setPrediction = (item: number, p: Prediction) => {
    setEntries((e) => ({ ...e, predictions: { ...e.predictions, [item]: p } }))
    if (slug) saveEntry(slug, { kind: 'prediction', item, text: p.text, rating: p.rating }).catch(() => {})
  }
  return { entries, loaded, setPrediction }
}

/** A text value saved automatically a moment after typing stops. Returns [value, setValue, status]. */
export function useAutosave(initial: string, save: (v: string) => Promise<void>, delay = 800) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  const update = (v: string) => {
    setValue(v)
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      saveRef.current(v).then(
        () => setStatus('saved'),
        () => setStatus('error'),
      )
    }, delay)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return [value, update, status, setValue] as const
}
