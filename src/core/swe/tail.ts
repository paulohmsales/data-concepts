import { normal, type Rng } from '../random.ts'

/**
 * Tail latency at scale. One backend call is usually fast, but a small share hits a slow path
 * (GC pause, cache miss, noisy neighbour). A request that fans out to n backends waits for the
 * slowest one, so its latency is the max of n draws. Hedging: if a call hasn’t answered after
 * `hedgeAfter` ms, send a duplicate to another replica and take whichever answers first.
 */
export interface TailParams {
  fanout: number
  /** Share of backend calls that are slow. */
  slowShare: number
  /** Typical fast and slow latencies (ms, medians). */
  fastMs: number
  slowMs: number
  /** Hedge after this many ms (Infinity = never). */
  hedgeAfter: number
}

export function backendCall(p: Pick<TailParams, 'slowShare' | 'fastMs' | 'slowMs'>, rng: Rng): number {
  const slow = rng() < p.slowShare
  const median = slow ? p.slowMs : p.fastMs
  return median * Math.exp(0.35 * normal(rng))
}

/** One backend with optional hedging; returns latency and how many calls it cost. */
function hedgedCall(p: TailParams, rng: Rng): { ms: number; calls: number } {
  const first = backendCall(p, rng)
  if (first <= p.hedgeAfter) return { ms: first, calls: 1 }
  const second = p.hedgeAfter + backendCall(p, rng)
  return { ms: Math.min(first, second), calls: 2 }
}

export function simulateRequests(p: TailParams, n: number, rng: Rng) {
  const latencies: number[] = []
  let calls = 0
  for (let i = 0; i < n; i++) {
    let worst = 0
    for (let j = 0; j < p.fanout; j++) {
      const c = hedgedCall(p, rng)
      worst = Math.max(worst, c.ms)
      calls += c.calls
    }
    latencies.push(worst)
  }
  latencies.sort((a, b) => a - b)
  const q = (x: number) => latencies[Math.min(latencies.length - 1, Math.floor(x * latencies.length))]
  return { latencies, p50: q(0.5), p95: q(0.95), p99: q(0.99), extraLoad: calls / (n * p.fanout) - 1 }
}

/** Probability a fan-out request hits at least one slow backend. */
export const pAnySlow = (slowShare: number, fanout: number) => 1 - (1 - slowShare) ** fanout
