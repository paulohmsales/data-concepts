import { describe, expect, it } from 'vitest'
import { latency, monthlyCost, TIERS, wordsToTokens, type Workload } from '../../src/core/ai/cost.ts'

const w: Workload = { requestsPerDay: 1000, inputTokens: 2000, outputTokens: 500, cacheHit: 0, cacheDiscount: 0.1, batch: false, routedToSmall: 0 }

describe('LLM cost', () => {
  it('hand calculation: 1,000 requests/day × 30 days on the medium tier', () => {
    // per request: 2000 × 3/1e6 + 500 × 15/1e6 = 0.006 + 0.0075 = 0.0135; × 30,000 = 405
    const c = monthlyCost(TIERS.medium, w)
    expect(c.perRequest).toBeCloseTo(0.0135, 10)
    expect(c.total).toBeCloseTo(405, 6)
  })

  it('caching a 90% shared prefix cuts input cost by ~81%', () => {
    const plain = monthlyCost(TIERS.medium, w)
    const cached = monthlyCost(TIERS.medium, { ...w, cacheHit: 0.9 })
    expect((cached.input + cached.cached) / plain.input).toBeCloseTo(0.1 + 0.9 * 0.1, 10)
  })

  it('batch halves everything; routing to the small model blends the prices', () => {
    expect(monthlyCost(TIERS.medium, { ...w, batch: true }).total).toBeCloseTo(405 / 2, 6)
    const routed = monthlyCost(TIERS.large, { ...w, routedToSmall: 0.8 })
    const big = monthlyCost(TIERS.large, w)
    const small = monthlyCost(TIERS.small, w)
    expect(routed.total).toBeCloseTo(0.2 * big.total + 0.8 * small.total, 6)
  })

  it('latency: generation time grows with output tokens; caching shortens time to first token', () => {
    const short = latency(TIERS.medium, 2000, 100)
    const long = latency(TIERS.medium, 2000, 1000)
    expect(long.total - short.total).toBeCloseTo(900 / 70, 6)
    expect(latency(TIERS.medium, 50_000, 10, 0.9).ttft).toBeLessThan(latency(TIERS.medium, 50_000, 10).ttft)
  })

  it('words to tokens', () => {
    expect(wordsToTokens(750)).toBe(998)
  })
})
