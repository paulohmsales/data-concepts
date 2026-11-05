import { describe, expect, it } from 'vitest'
import { assign, partitionFor, simulateKafka, type KafkaParams } from '../../src/core/kafka.ts'

const base: KafkaParams = { partitions: 6, consumers: 3, rate: 6000, capacity: 1500, hotShare: 0, scaleOut: false, protocol: 'eager' }
const total = (row: number[]) => row.reduce((a, b) => a + b, 0)

describe('consumer group', () => {
  it('too few consumers: lag grows by the capacity gap every second', () => {
    expect(simulateKafka(base).finalLag).toBe(300 * 1500)
  })
  it('enough consumers keep up; extra consumers beyond partitions sit idle', () => {
    expect(simulateKafka({ ...base, consumers: 6 }).finalLag).toBe(0)
    expect(simulateKafka({ ...base, consumers: 9 }).idleConsumers).toBe(3)
  })
  it('uneven assignment wastes capacity: 4 consumers on 6 partitions fall behind', () => {
    expect(assign(6, 4)).toEqual([0, 1, 2, 3, 0, 1])
    expect(simulateKafka({ ...base, consumers: 4 }).finalLag).toBeGreaterThan(200_000)
  })
  it('an eager rebalance spikes lag more than a cooperative one', () => {
    const eager = simulateKafka({ ...base, scaleOut: true })
    const coop = simulateKafka({ ...base, scaleOut: true, protocol: 'cooperative' })
    expect(eager.maxLag).toBeGreaterThan(coop.maxLag * 1.25)
    expect(eager.finalLag).toBe(0)
    expect(coop.finalLag).toBe(0)
    expect(total(eager.lag[110])).toBeGreaterThan(total(eager.lag[99]))
  })
  it('a hot key overloads one partition no matter how many consumers', () => {
    for (const n of [6, 12]) {
      const r = simulateKafka({ ...base, partitions: n, consumers: n, hotShare: 0.3 })
      expect(r.lag[299][0]).toBeGreaterThan(100_000)
      expect(total(r.lag[299]) - r.lag[299][0]).toBe(0)
    }
  })
  it('keys map to a stable partition', () => {
    expect(partitionFor('user-42', 6)).toBe(partitionFor('user-42', 6))
    expect(partitionFor('user-42', 6)).toBeLessThan(6)
  })
})
