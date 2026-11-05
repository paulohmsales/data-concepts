import { useSyncExternalStore } from 'react'
import type { ModuleMeta } from './content.ts'

export type MarkKind = 'experiment' | 'interview' | 'check' | 'done' | 'visit'

export interface ModuleProgress {
  experiment: number[]
  interview: number[]
  check: number[]
  done: boolean
  visited: number | null
}

export interface Progress {
  user: string
  modules: Record<string, ModuleProgress>
  days: Record<string, number>
  predictions?: { made: number; right: number; partly: number; wrong: number }
}

const EMPTY: Progress = { user: '', modules: {}, days: {} }
let state: Progress = EMPTY
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function load() {
  if (loaded) return
  loaded = true
  fetch('/api/progress')
    .then((r) => (r.ok ? r.json() : EMPTY))
    .then((p: Progress) => {
      state = p
      emit()
    })
    .catch(() => {})
}

const blank = (): ModuleProgress => ({ experiment: [], interview: [], check: [], done: false, visited: null })
const today = () => new Date().toISOString().slice(0, 10)

/** Mark (or unmark) something; updates the UI at once and saves in the background. */
export function mark(slug: string, kind: MarkKind, item = 0, value = true) {
  const m = { ...(state.modules[slug] ?? blank()) }
  if (kind === 'done') m.done = value
  else if (kind === 'visit') m.visited = Date.now() / 1000
  else m[kind] = value ? [...new Set([...m[kind], item])] : m[kind].filter((x) => x !== item)
  const days = kind !== 'visit' && value ? { ...state.days, [today()]: (state.days[today()] ?? 0) + 1 } : state.days
  state = { ...state, modules: { ...state.modules, [slug]: m }, days }
  emit()
  void fetch(`/api/progress/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, item, value }),
  }).catch(() => {})
}

export async function resetProgress() {
  state = { ...state, modules: {}, days: {} }
  emit()
  await fetch('/api/progress', { method: 'DELETE' }).catch(() => {})
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      load()
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** 0–1: a done module is 1; otherwise the share of experiments, interview and check items ticked. */
export function moduleFraction(meta: Pick<ModuleMeta, 'counts'>, p: ModuleProgress | undefined): number {
  if (!p) return 0
  if (p.done) return 1
  const parts = (['experiment', 'interview', 'check'] as const).filter((k) => meta.counts[k] > 0)
  if (!parts.length) return 0
  const f = parts.reduce((s, k) => s + Math.min(1, p[k].length / meta.counts[k]), 0) / parts.length
  return Math.min(0.99, f)
}

export const statusOf = (f: number, visited: boolean) => (f >= 1 ? 'done' : f > 0 || visited ? 'started' : 'new')
