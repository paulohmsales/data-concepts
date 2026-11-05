import { describe, expect, it } from 'vitest'
import { noRecovery, simulateAgents, withRecovery } from '../../src/core/ai/agents.ts'
import { mulberry32 } from '../../src/core/random.ts'

describe('agent reliability', () => {
  it('no error detection: success ≈ p^k', () => {
    const r = simulateAgents({ steps: 10, p: 0.95, detect: 0, budget: 1000 }, 20_000, mulberry32(1))
    expect(r.success).toBeCloseTo(noRecovery(0.95, 10), 2)
    expect(noRecovery(0.95, 10)).toBeCloseTo(0.599, 3)
  })

  it('detection plus retries: matches the closed form', () => {
    const r = simulateAgents({ steps: 10, p: 0.9, detect: 0.8, budget: 1000 }, 20_000, mulberry32(2))
    expect(r.success).toBeCloseTo(withRecovery(0.9, 0.8, 10), 2)
    expect(r.success).toBeGreaterThan(noRecovery(0.9, 10) + 0.3)
  })

  it('perfect detection with a big budget always succeeds; a tight budget does not', () => {
    expect(simulateAgents({ steps: 10, p: 0.8, detect: 1, budget: 1000 }, 5000, mulberry32(3)).success).toBe(1)
    const tight = simulateAgents({ steps: 10, p: 0.8, detect: 1, budget: 11 }, 5000, mulberry32(4))
    expect(tight.budget).toBeGreaterThan(0.4)
  })

  it('retries cost calls', () => {
    const r = simulateAgents({ steps: 10, p: 0.8, detect: 1, budget: 1000 }, 5000, mulberry32(5))
    expect(r.meanCalls).toBeCloseTo(10 / 0.8, 0)
  })
})
