import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { expectedMissRate, simulateSlo, type SloParams } from '../../src/core/slo.ts'

const base: SloParams = { deadline: 7 * 60, target: 0.95, deploysPerWeek: 10, freeze: false, seed: 1 }
const run = (p: Partial<SloParams>, seed = 1) => simulateSlo({ ...base, ...p, seed }, mulberry32(seed))

describe('error budgets', () => {
  it('the budget is the misses the target allows', () => {
    expect(run({}).budget).toBeCloseTo(4.5, 9)
    expect(run({ target: 0.999 }).budget).toBeCloseTo(0.09, 9)
  })
  it('a 99.9% target on a daily product is blown by any single miss', () => {
    for (const seed of [1, 2, 3]) expect(run({ target: 0.999 }, seed).met).toBe(false)
  })
  it('a deadline too close to the normal finish misses constantly', () => {
    expect(expectedMissRate(6 * 60 + 20, 10)).toBeGreaterThan(0.15)
    for (const seed of [1, 2, 3]) expect(run({ deadline: 380 }, seed).misses).toBeGreaterThan(10)
  })
  it('deploy rate drives the miss rate', () => {
    expect(expectedMissRate(420, 20)).toBeGreaterThan(expectedMissRate(420, 2) * 3)
  })
  it('a freeze policy trades shipped changes for reliability', () => {
    for (const seed of [1, 2, 3]) {
      const free = run({ deploysPerWeek: 20 }, seed)
      const freeze = run({ deploysPerWeek: 20, freeze: true }, seed)
      expect(free.met).toBe(false)
      expect(freeze.misses).toBeLessThan(free.misses)
      expect(freeze.deploysShipped).toBeLessThan(free.deploysShipped * 0.75)
    }
  })
})
