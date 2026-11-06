/** Types of the content API responses (api/app/schema.py is the source of truth). */
export type RoleKey = 'da' | 'ae' | 'de' | 'ds' | 'mle' | 'ai' | 'swe' | 'mgr'

export interface Track {
  key: string
  title: string
  blurb: string
  order: number
}

export interface ModuleMeta {
  slug: string
  title: string
  track: string
  summary: string
  roles: RoleKey[]
  lab: string
  order: number
  status: 'live' | 'draft'
  counts: { experiment: number; interview: number; check: number }
  /** slugs this module links to (from its deep dive), for the concept map */
  related?: string[]
}

export interface Catalog {
  tracks: Track[]
  modules: ModuleMeta[]
  roles: { key: RoleKey; title: string }[]
}

export type Block =
  | { type: 'markdown'; md: string }
  | { type: 'heading'; text: string; level: 3 | 4 }
  | { type: 'formula'; text: string; caption?: string | null }
  | { type: 'callout'; kind: 'note' | 'warn' | 'prod'; title?: string | null; md: string }
  | { type: 'steps'; items: { title: string; md: string }[] }
  | { type: 'worked'; title: string; md: string }
  | { type: 'code'; lang: string; code: string; caption?: string | null }
  | { type: 'table'; columns: { key: string; label: string }[]; rows: Record<string, string>[]; caption?: string | null }
  | { type: 'visual'; key: string; props: Record<string, unknown>; caption?: string | null }
  | { type: 'stepper'; key: string; props: Record<string, unknown>; steps: { title: string; md: string; state: Record<string, unknown> }[]; caption?: string | null }
  | { type: 'related'; slugs: string[] }

export interface ExperimentContent {
  title: string
  goal: string
  look: string
  why: string
  setup: Record<string, unknown> | null
}

export interface InterviewContent {
  level: 'junior' | 'mid' | 'senior' | 'staff'
  q: string
  answer: string
  listen_for: string[]
  follow_ups: { q: string; a: string }[]
}

export interface ModuleContent extends ModuleMeta {
  intuition: string
  experiments: ExperimentContent[]
  deep_dive: Block[]
  interview: InterviewContent[]
  check: { q: string; a: string }[]
}

export interface RoleBrief {
  key: RoleKey
  title: string
  what: string
  ic: string[]
  manager: string[]
  interviews: string[]
  planned: string[]
}

export interface Market {
  source: string
  as_of: string
  sample: Record<RoleKey, number>
  demand: Record<string, Record<RoleKey, number>>
}

export interface Provider {
  key: string
  name: string
  kind: 'cloud' | 'platform'
  summary: string
  color: string
}

export interface Category {
  key: string
  name: string
  layer: 'store' | 'process' | 'serve' | 'govern' | 'ai' | 'ops'
  description: string
  order: number
}

export interface Service {
  provider: string
  category: string
  name: string
  summary: string
  pricing: string
  serverless: boolean | null
  open_source_base: string | null
  url: string | null
}

export interface Dimension {
  key: string
  name: string
  why: string
  values: Record<string, string>
}

export interface PricePoint {
  provider: string
  item: string
  unit: string
  usd: number
  note: string
  source: string
  as_of: string
}

export interface Architecture {
  key: string
  name: string
  description: string
  stages: { label: string; category: string }[]
}

export interface Platforms {
  providers: Provider[]
  categories: Category[]
  services: Service[]
  dimensions: Dimension[]
  prices: PricePoint[]
  architectures: Architecture[]
}

export interface SearchHit {
  kind: 'module' | 'service' | 'case'
  ref: string
  title: string
  snippet: string
}

/* ---------- integrations ---------- */

export type IntegrationKey = 'bigquery' | 'snowflake' | 'athena' | 'databricks'

export interface Recipe {
  id: string
  title: string
  goal: string
  sql: string
  look: string
  why: string
  dry_run: boolean
}

export interface Integration {
  key: IntegrationKey
  name: string
  vendor: string
  summary: string
  cost_note: string
  config_template: string
  setup: { title: string; md: string }[]
  recipes: Recipe[]
}

export interface IntegrationStatus {
  configured: boolean
  problem: string | null
  limits: { daily_queries: number; daily_bytes: number; timeout_s: number; max_rows: number }
  today: { queries: number; bytes: number; cost_usd: number }
}

export interface RunResult {
  columns: string[]
  rows: unknown[][]
  ms: number
  bytes_scanned: number | null
  cost_usd: number | null
  query_id: string | null
  truncated: boolean
  stats: Record<string, unknown>
}

export interface RunLog {
  sql: string
  started_at: number
  ms: number
  rows: number
  bytes: number
  cost_usd: number
  status: 'ok' | 'error'
  error: string | null
}

export interface Comparison {
  id: string
  title: string
  question: string
  why: string
  runs: { provider: IntegrationKey; sql: string }[]
}

/* ---------- case studies ---------- */

export interface CaseMeta {
  id: string
  title: string
  summary: string
  roles: RoleKey[]
  related: string[]
  order: number
  steps: number
}

export interface CaseContent extends Omit<CaseMeta, 'steps'> {
  brief: string
  setup: string[]
  steps: { title: string; prompt: string; sql: string; finding: string; why: string }[]
  resolution: string
}
