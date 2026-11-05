import { normal, mulberry32, type Rng } from '../random.ts'

/**
 * A toy embedding space. Each phrase is a mix of a few topic directions plus noise in 16 dimensions,
 * so phrases about the same thing point the same way even with no words in common (that is the
 * property real embedding models learn from data). Also: a synthetic collection for ANN search.
 */
export const DIM = 16
export type Vec = number[]

export const TOPICS = ['money', 'time off', 'on-call', 'data', 'security', 'deploys', 'people', 'food'] as const

function topicDirs(rng: Rng): Vec[] {
  return TOPICS.map(() => normalize(Array.from({ length: DIM }, () => normal(rng))))
}

export const dot = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * b[i], 0)
export const norm = (a: Vec) => Math.sqrt(dot(a, a))
export const normalize = (a: Vec) => {
  const n = norm(a) || 1
  return a.map((x) => x / n)
}
export const cosine = (a: Vec, b: Vec) => dot(a, b) / ((norm(a) || 1) * (norm(b) || 1))
export const euclid = (a: Vec, b: Vec) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0))

export interface Phrase {
  text: string
  topics: Partial<Record<(typeof TOPICS)[number], number>>
  /** Vector length multiplier (e.g. long documents produce bigger unnormalised vectors). */
  scale?: number
}

export const PHRASES: Phrase[] = [
  { text: 'payroll questions go to the people team', topics: { money: 0.6, people: 0.8 } },
  { text: 'my salary is wrong', topics: { money: 0.65, people: 0.75 } },
  { text: 'reimbursing a conference ticket', topics: { money: 0.9, people: 0.2 } },
  { text: 'learning budget per year', topics: { money: 0.8, people: 0.3 } },
  { text: 'how many vacation days do I have', topics: { 'time off': 1 } },
  { text: 'paid time off accrues monthly', topics: { 'time off': 0.9, money: 0.2 } },
  { text: 'parental leave policy', topics: { 'time off': 0.8, people: 0.4 } },
  { text: 'acknowledge a page within 15 minutes', topics: { 'on-call': 1 } },
  { text: 'night pages and the on-call stipend', topics: { 'on-call': 0.8, money: 0.4 } },
  { text: 'incident postmortem template', topics: { 'on-call': 0.7, deploys: 0.3 } },
  { text: 'raw events kept for 13 months', topics: { data: 1 } },
  { text: 'dashboard refreshed by 7am', topics: { data: 0.8, 'on-call': 0.2 } },
  { text: 'delete personal data on request', topics: { data: 0.6, security: 0.7 } },
  { text: 'rotate service account keys', topics: { security: 1 } },
  { text: 'multi-factor authentication required', topics: { security: 0.9 } },
  { text: 'deployment freeze on Fridays', topics: { deploys: 1 } },
  { text: 'roll back by reverting the merge', topics: { deploys: 0.9 } },
  { text: 'new joiners get a buddy', topics: { people: 1 } },
  { text: 'team lunch every Thursday', topics: { food: 1, people: 0.3 } },
  { text: 'the canteen menu', topics: { food: 1 } },
  { text: 'the complete employee handbook, all chapters (a very long document)', topics: { money: 0.6, 'time off': 0.6, 'on-call': 0.6, data: 0.6, security: 0.6, deploys: 0.6, people: 0.6 }, scale: 4 },
]

export function embedPhrases(seed = 2): Vec[] {
  const rng = mulberry32(seed)
  const dirs = topicDirs(rng)
  return PHRASES.map((p) => {
    const v = Array.from({ length: DIM }, () => 0.1 * normal(rng))
    for (const [t, w] of Object.entries(p.topics)) {
      const d = dirs[TOPICS.indexOf(t as (typeof TOPICS)[number])]
      for (let i = 0; i < DIM; i++) v[i] += (w ?? 0) * d[i]
    }
    const unit = normalize(v)
    return unit.map((x) => x * (p.scale ?? 1))
  })
}

export type Metric = 'cosine' | 'dot' | 'euclidean'

/** Rank all items by similarity to the query (higher = closer). */
export function rank(query: Vec, items: readonly Vec[], metric: Metric) {
  const score = (v: Vec) => (metric === 'cosine' ? cosine(query, v) : metric === 'dot' ? dot(query, v) : -euclid(query, v))
  return items.map((v, i) => ({ i, score: score(v) })).sort((a, b) => b.score - a.score)
}

/** Project vectors to 2-D with PCA (power iteration on the covariance), for drawing. */
export function pca2(vs: readonly Vec[]): [number, number][] {
  const n = vs.length
  const mean = Array.from({ length: DIM }, (_, j) => vs.reduce((s, v) => s + v[j], 0) / n)
  const X = vs.map((v) => v.map((x, j) => x - mean[j]))
  const cov = Array.from({ length: DIM }, (_, a) => Array.from({ length: DIM }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0) / n))
  const comps: Vec[] = []
  for (let c = 0; c < 2; c++) {
    let v = normalize(Array.from({ length: DIM }, (_, i) => Math.sin(i + 1 + c)))
    for (let it = 0; it < 200; it++) {
      let w = cov.map((row) => dot(row, v))
      for (const prev of comps) {
        const p = dot(w, prev)
        w = w.map((x, i) => x - p * prev[i])
      }
      v = normalize(w)
    }
    comps.push(v)
  }
  return X.map((r) => [dot(r, comps[0]), dot(r, comps[1])])
}

// ---------------------------------------------------------------------------------------------
// Approximate nearest neighbours: an IVF (inverted file) index
// ---------------------------------------------------------------------------------------------

/** n unit vectors drawn around `clusters` random centres (a stand-in for a real document collection). */
export function collection(n: number, clusters: number, spread: number, seed = 1): Vec[] {
  const rng = mulberry32(seed)
  const centres = Array.from({ length: clusters }, () => normalize(Array.from({ length: DIM }, () => normal(rng))))
  return Array.from({ length: n }, () => {
    const c = centres[Math.floor(rng() * clusters)]
    return normalize(c.map((x) => x + spread * normal(rng)))
  })
}

/** k-means with cosine assignment (spherical k-means), a few iterations. */
export function kmeans(vs: readonly Vec[], k: number, iters = 8, seed = 2): { centroids: Vec[]; assign: number[] } {
  const rng = mulberry32(seed)
  let centroids = Array.from({ length: k }, () => vs[Math.floor(rng() * vs.length)])
  let assign = new Array<number>(vs.length).fill(0)
  for (let it = 0; it < iters; it++) {
    assign = vs.map((v) => {
      let best = 0
      let bs = -Infinity
      centroids.forEach((c, j) => {
        const s = dot(v, c)
        if (s > bs) {
          bs = s
          best = j
        }
      })
      return best
    })
    centroids = centroids.map((c, j) => {
      const members = vs.filter((_, i) => assign[i] === j)
      if (!members.length) return c
      return normalize(Array.from({ length: DIM }, (_, d) => members.reduce((s, m) => s + m[d], 0)))
    })
  }
  return { centroids, assign }
}

export interface IvfResult {
  ids: number[]
  scanned: number
}

/** Search only the `nprobe` lists whose centroids are closest to the query. */
export function ivfSearch(query: Vec, vs: readonly Vec[], index: { centroids: Vec[]; assign: number[] }, nprobe: number, k: number): IvfResult {
  const lists = index.centroids.map((c, j) => ({ j, s: dot(query, c) })).sort((a, b) => b.s - a.s).slice(0, nprobe).map((x) => x.j)
  const keep = new Set(lists)
  const cand = vs.map((v, i) => ({ i, v })).filter((x) => keep.has(index.assign[x.i]))
  const ids = cand.map((x) => ({ i: x.i, s: dot(query, x.v) })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i)
  return { ids, scanned: cand.length }
}

export function exactSearch(query: Vec, vs: readonly Vec[], k: number): number[] {
  return vs.map((v, i) => ({ i, s: dot(query, v) })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i)
}

export const recallAt = (approx: number[], exact: number[]) => approx.filter((i) => exact.includes(i)).length / exact.length
