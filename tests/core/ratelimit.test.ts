import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { simulateRetries, tokenBucket, type RetryParams } from '../../src/core/swe/ratelimit.ts'

const base: RetryParams = { rate: 800, capacity: 1000, burst: 200, outageStart: 5, outageEnd: 8, strategy: 'jitter', baseDelay: 0.2, maxAttempts: 8, seconds: 40 }

describe('token bucket', () => {
  it('admits a burst, then the refill rate', () => {
    const arrivals = Array.from({ length: 30 }, () => 0) // 30 at once
    expect(tokenBucket(arrivals, 10, 20).filter(Boolean).length).toBe(20)
    const steady = Array.from({ length: 100 }, (_, i) => i * 0.05) // 20/s for 5 s against 10/s
    const ok = tokenBucket(steady, 10, 5).filter(Boolean).length
    expect(ok).toBeGreaterThan(50)
    expect(ok).toBeLessThan(60)
  })
})

describe('retries after an outage', () => {
  it('no retries: everything during the outage is lost, recovery is instant', () => {
    const r = simulateRetries({ ...base, strategy: 'none' }, mulberry32(1))
    expect(r.dropped).toBeGreaterThan(2000)
    expect(r.recovered).toBe(0)
  })

  it('backoff with jitter recovers quickly and loses little', () => {
    const r = simulateRetries(base, mulberry32(2))
    expect(r.recovered).toBeLessThan(10)
    expect(r.dropped).toBeLessThan(300)
  })

  it('immediate retries hammer the server: a far higher peak load and more waste', () => {
    const imm = simulateRetries({ ...base, strategy: 'immediate', maxAttempts: 50 }, mulberry32(3))
    const jit = simulateRetries(base, mulberry32(3))
    expect(imm.peak).toBeGreaterThan(jit.peak * 3)
    expect(imm.attemptsTotal).toBeGreaterThan(jit.attemptsTotal * 1.5)
  })

  it('a thundering herd: without jitter, clients retry in lockstep and collide again', () => {
    const herd = { ...base, rate: 0, outageStart: 0, outageEnd: 0, initialBurst: 2000, capacity: 200, burst: 50, maxAttempts: 12, seconds: 60 }
    const exp = simulateRetries({ ...herd, strategy: 'exponential' }, mulberry32(4))
    const jit = simulateRetries({ ...herd, strategy: 'jitter' }, mulberry32(4))
    expect(jit.attemptsTotal).toBeLessThan(exp.attemptsTotal * 0.8)
    expect(jit.lastAccepted).toBeLessThan(exp.lastAccepted * 0.8)
    expect(jit.dropped).toBeLessThan(exp.dropped + 1)
  })
})
