import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { demand, multiplier, surgeGrid, surgeStats, type SurgeParams } from '../../src/core/surge.ts'

const run = (seed: number, p: SurgeParams) => surgeStats(surgeGrid(demand(mulberry32(seed)), p), p)

describe('surge multiplier', () => {
  it('is 1 below capacity and capped at 3', () => {
    expect(multiplier(0.3, 0.6)).toBe(1)
    expect(multiplier(100, 0.6)).toBe(3)
  })
})

describe.each([1, 2])('surge trade-offs (seed %i)', (seed) => {
  it('tiny cells and a 1-minute window flicker everywhere', () => {
    expect(run(seed, { cell: 1, window: 1 }).falseSurge).toBeGreaterThan(0.3)
  })
  it('2×2 cells with a 5-minute window: responsive, stable, strong at the venue', () => {
    const s = run(seed, { cell: 2, window: 5 })
    expect(s.falseSurge).toBeLessThan(0.03)
    expect(s.lag).toBeLessThanOrEqual(2)
    expect(s.eventMult).toBeGreaterThan(2.5)
  })
  it('a 15-minute window lingers long after the crowd has gone', () => {
    expect(run(seed, { cell: 2, window: 15 }).linger).toBeGreaterThanOrEqual(12)
  })
  it('1 km cells dilute the hotspot', () => {
    expect(run(seed, { cell: 4, window: 5 }).eventMult).toBeLessThan(1.5)
  })
})
