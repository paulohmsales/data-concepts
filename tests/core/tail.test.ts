import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { pAnySlow, simulateRequests, type TailParams } from '../../src/core/swe/tail.ts'

const base: TailParams = { fanout: 1, slowShare: 0.01, fastMs: 10, slowMs: 1000, hedgeAfter: Infinity }

describe('tail latency', () => {
  it('a 1% slow path barely touches p50 but sets p99 for a single call', () => {
    const r = simulateRequests(base, 50_000, mulberry32(1))
    expect(r.p50).toBeLessThan(15)
    expect(r.p99).toBeGreaterThan(200)
  })

  it('fanning out to 100 backends makes most requests slow (1 − 0.99¹⁰⁰ ≈ 63%)', () => {
    expect(pAnySlow(0.01, 100)).toBeCloseTo(0.634, 3)
    const r = simulateRequests({ ...base, fanout: 100 }, 5_000, mulberry32(2))
    expect(r.p50).toBeGreaterThan(300)
  })

  it('hedging after the fast path’s p95-ish cuts the tail for a few % extra calls', () => {
    const plain = simulateRequests({ ...base, fanout: 100 }, 3_000, mulberry32(3))
    const hedged = simulateRequests({ ...base, fanout: 100, hedgeAfter: 25 }, 3_000, mulberry32(3))
    expect(hedged.p99).toBeLessThan(plain.p99 / 5)
    expect(hedged.extraLoad).toBeLessThan(0.05)
  })
})
