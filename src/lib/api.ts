import { use } from 'react'
import type { CaseContent, CaseMeta, Catalog, Comparison, Integration, IntegrationKey, IntegrationStatus, ModuleContent, Market, Platforms, RoleBrief, RunLog, RunResult, SearchHit } from './content.ts'

const cache = new Map<string, Promise<unknown>>()

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

/** One shared promise per path, so every component asking for it suspends on the same request. */
export function resource<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = getJson<T>(path)
    // failed requests shouldn't stick: allow a retry on the next render
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

/** Suspends until the data is there (wrap callers in <Suspense> and an error boundary). */
export const useCatalog = () => use(resource<Catalog>('/api/catalog'))
export const useModuleContent = (slug: string) => use(resource<ModuleContent>(`/api/modules/${encodeURIComponent(slug)}`))
export const useRoles = () => use(resource<{ roles: RoleBrief[]; market: Market }>('/api/roles'))
export const usePlatforms = () => use(resource<Platforms>('/api/platforms'))

export const search = (q: string) => getJson<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`)

/* ---------- integrations: content is cached; status, runs and history are always live ---------- */

export const useIntegrations = () => use(resource<Integration[]>('/api/integrations'))
export const integrationStatus = () => getJson<Record<IntegrationKey, IntegrationStatus>>('/api/integrations/status')
export const integrationHistory = (key: IntegrationKey) => getJson<RunLog[]>(`/api/integrations/${key}/history`)

export async function runQuery(key: IntegrationKey, sql: string, dryRun = false): Promise<RunResult> {
  const res = await fetch(`/api/integrations/${key}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sql, dry_run: dryRun }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `${res.status} ${res.statusText}`)
  return body as RunResult
}
export const useComparisons = () => use(resource<Comparison[]>('/api/integrations/comparisons'))
export const useCases = () => use(resource<CaseMeta[]>('/api/cases'))
export const useCase = (id: string) => use(resource<CaseContent>(`/api/cases/${encodeURIComponent(id)}`))
