import type { Rng } from '../random.ts'

/**
 * Caching. Requests follow a Zipf distribution (a few keys are very popular, a long tail is rare).
 * An LRU cache of C entries keeps the most recently used keys. Expiry (TTL) bounds staleness but
 * sends traffic back to the database; synchronised expiry causes stampedes.
 */
export function zipfCdf(n: number, s: number): Float64Array {
  const w = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) total += w[i] = 1 / (i + 1) ** s
  let acc = 0
  for (let i = 0; i < n; i++) w[i] = acc += w[i] / total
  return w
}

export function sampleZipf(cdf: Float64Array, rng: Rng): number {
  const u = rng()
  let lo = 0
  let hi = cdf.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cdf[mid] < u) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** LRU hit rate on `requests` Zipf requests (Map keeps insertion order: delete + set = move to newest). */
export function lruHitRate(cdf: Float64Array, capacity: number, requests: number, rng: Rng): number {
  const cache = new Map<number, true>()
  let hits = 0
  const warm = Math.min(requests / 5, capacity * 5)
  for (let i = 0; i < requests + warm; i++) {
    const k = sampleZipf(cdf, rng)
    if (cache.has(k)) {
      cache.delete(k)
      cache.set(k, true)
      if (i >= warm) hits++
    } else {
      cache.set(k, true)
      if (cache.size > capacity) cache.delete(cache.keys().next().value!)
    }
  }
  return hits / requests
}

/** Best possible static cache: always holds the C most popular keys. */
export const idealHitRate = (cdf: Float64Array, capacity: number) => (capacity <= 0 ? 0 : cdf[Math.min(cdf.length, capacity) - 1])

/** Share of reads that return a stale value, for a key updated at rate u per second and TTL T seconds. */
export const staleShare = (updatesPerSec: number, ttl: number) => {
  const x = updatesPerSec * ttl
  return x === 0 ? 0 : 1 - (1 - Math.exp(-x)) / x
}

export interface StampedeParams {
  /** Keys warmed at time 0 (e.g. after a deploy or cache flush). */
  keys: number
  /** Requests per second per key. */
  ratePerKey: number
  ttl: number
  /** Random spread of each key’s TTL, as a fraction (0.2 = ±20%). */
  jitter: number
  /** Seconds the database takes to recompute a value. */
  refill: number
  /** Request coalescing: only one request per key goes to the database while it refills. */
  coalesce: boolean
  seconds: number
}

/** Database queries per second over time. */
export function dbLoad(p: StampedeParams, rng: Rng): number[] {
  const load = new Array<number>(p.seconds).fill(0)
  for (let k = 0; k < p.keys; k++) {
    let expires = p.ttl * (1 + p.jitter * (2 * rng() - 1))
    while (expires < p.seconds) {
      const t = Math.floor(expires)
      // requests arriving while the value is being recomputed all miss (unless coalesced)
      const misses = p.coalesce ? 1 : Math.max(1, Math.round(p.ratePerKey * p.refill))
      load[t] += misses
      expires += p.refill + p.ttl * (1 + p.jitter * (2 * rng() - 1))
    }
  }
  return load
}
