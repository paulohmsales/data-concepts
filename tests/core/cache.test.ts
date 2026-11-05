import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { dbLoad, idealHitRate, lruHitRate, sampleZipf, staleShare, zipfCdf } from '../../src/core/swe/cache.ts'

describe('caching', () => {
  const cdf = zipfCdf(10_000, 1)

  it('zipf sampling matches the distribution (key 0 has ≈ 1/H(10,000) ≈ 10.2%)', () => {
    const rng = mulberry32(1)
    let zeros = 0
    for (let i = 0; i < 100_000; i++) if (sampleZipf(cdf, rng) === 0) zeros++
    expect(zeros / 100_000).toBeCloseTo(cdf[0], 2)
    expect(cdf[0]).toBeCloseTo(0.1020, 3)
  })

  it('a cache of 1% of keys serves a big share of skewed traffic, close to the ideal', () => {
    const lru = lruHitRate(cdf, 100, 100_000, mulberry32(2))
    expect(idealHitRate(cdf, 100)).toBeCloseTo(0.53, 2)
    expect(lru).toBeGreaterThan(0.35)
    expect(lru).toBeLessThanOrEqual(idealHitRate(cdf, 100) + 0.01)
  })

  it('caching everything hits (after warm-up) nearly always', () => {
    expect(lruHitRate(cdf, 10_000, 50_000, mulberry32(3))).toBeGreaterThan(0.9)
  })

  it('staleness grows with TTL × update rate', () => {
    expect(staleShare(0, 60)).toBe(0)
    expect(staleShare(1 / 3600, 60)).toBeLessThan(0.01)
    expect(staleShare(1 / 60, 600)).toBeGreaterThan(0.85)
  })

  it('synchronised expiry makes a stampede; jitter and coalescing flatten it', () => {
    const p = { keys: 1000, ratePerKey: 20, ttl: 60, jitter: 0, refill: 0.5, coalesce: false, seconds: 200 }
    const spiky = dbLoad(p, mulberry32(4))
    const jittered = dbLoad({ ...p, jitter: 0.3 }, mulberry32(4))
    const coalesced = dbLoad({ ...p, coalesce: true }, mulberry32(4))
    expect(Math.max(...spiky)).toBe(10_000)
    expect(Math.max(...jittered)).toBeLessThan(2_000)
    expect(Math.max(...coalesced)).toBe(1000)
  })
})
