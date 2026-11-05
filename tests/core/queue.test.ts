import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/core/random.ts'
import { md1Wq, mm1, simulateQueue, type QueueParams } from '../../src/core/swe/queue.ts'

const base: QueueParams = { lambda: 8, mu: 10, servers: 1, service: 'exponential', capacity: Infinity, n: 200_000 }

describe('queues', () => {
  it('M/M/1 at 80% utilisation matches theory (W = 0.5 s)', () => {
    const s = simulateQueue(base, mulberry32(1))
    expect(s.meanTime / mm1(8, 10).W).toBeGreaterThan(0.93)
    expect(s.meanTime / mm1(8, 10).W).toBeLessThan(1.07)
    expect(s.utilization).toBeCloseTo(0.8, 1)
  })

  it("Little's law: L = λ·W", () => {
    const s = simulateQueue(base, mulberry32(2))
    expect(s.meanInSystem / (8 * s.meanTime)).toBeCloseTo(1, 1)
  })

  it('constant service times halve the wait (M/D/1)', () => {
    const s = simulateQueue({ ...base, service: 'constant' }, mulberry32(3))
    expect(s.meanWait / md1Wq(8, 10)).toBeGreaterThan(0.9)
    expect(s.meanWait / md1Wq(8, 10)).toBeLessThan(1.1)
  })

  it('waits explode near 100% utilisation', () => {
    const at50 = simulateQueue({ ...base, lambda: 5 }, mulberry32(4)).meanTime
    const at95 = simulateQueue({ ...base, lambda: 9.5 }, mulberry32(5)).meanTime
    expect(at95 / at50).toBeGreaterThan(6)
  })

  it('a bounded queue rejects instead of waiting forever', () => {
    const s = simulateQueue({ ...base, lambda: 12, capacity: 10, n: 50_000 }, mulberry32(6))
    expect(s.rejected).toBeGreaterThan(0.1)
    expect(s.meanWait).toBeLessThan(1.2)
  })

  it('two servers sharing one queue beat two separate queues', () => {
    const pooled = simulateQueue({ ...base, lambda: 16, servers: 2 }, mulberry32(7)).meanWait
    const separate = mm1(8, 10).Wq
    expect(pooled).toBeLessThan(separate * 0.7)
  })
})
