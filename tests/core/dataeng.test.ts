import { describe, expect, it } from 'vitest'
import { expectedWritesPerEvent, simulateDelivery } from '../../src/core/delivery.ts'
import { partitions, queryCost, DEFAULT_TABLE as T, workerLoads } from '../../src/core/partitioning.ts'
import { mulberry32 } from '../../src/core/random.ts'
import { generateEvents, runStream, type StreamParams } from '../../src/core/streaming.ts'

describe('delivery semantics', () => {
  const base = { events: 20_000, pRequestLost: 0.1, pAckLost: 0.1, maxAttempts: 50 }

  it('at-most-once loses about pRequestLost of events, never duplicates', () => {
    const r = simulateDelivery({ ...base, retry: 'at-most-once', sink: 'append' }, mulberry32(1))
    expect(r.lost / base.events).toBeCloseTo(0.1, 1)
    expect(r.duplicates).toBe(0)
  })

  it('at-least-once + append: nothing lost, duplicates as theory says', () => {
    const r = simulateDelivery({ ...base, retry: 'at-least-once', sink: 'append' }, mulberry32(2))
    expect(r.lost).toBe(0)
    expect(r.rows / base.events).toBeCloseTo(expectedWritesPerEvent(0.1), 1)
  })

  it('at-least-once + idempotent upsert = effectively exactly once', () => {
    const r = simulateDelivery({ ...base, retry: 'at-least-once', sink: 'upsert' }, mulberry32(3))
    expect(r.rows).toBe(base.events)
    expect(r.duplicates).toBe(0)
  })
})

describe('event time and watermarks', () => {
  const p: StreamParams = { rate: 20, duration: 600, window: 60, meanDelay: 2, stragglers: 0.02, allowedLateness: 0 }
  const input = generateEvents(p, mulberry32(4))

  it('zero allowed lateness drops late events', () => {
    expect(runStream(p, input).dropped).toBeGreaterThan(0)
  })

  it('lateness larger than every delay drops nothing', () => {
    const maxDelay = Math.max(...input.map((e) => e.arrival - e.t))
    expect(runStream({ ...p, allowedLateness: maxDelay + 1 }, input).dropped).toBe(0)
  })

  it('more allowed lateness: fewer drops, later results', () => {
    const a = runStream({ ...p, allowedLateness: 5 }, input)
    const b = runStream({ ...p, allowedLateness: 60 }, input)
    expect(b.dropRate).toBeLessThan(a.dropRate)
    expect(b.latency).toBeGreaterThan(a.latency)
  })

  it('an outage piles delayed events into the window after it (processing time)', () => {
    const q = { ...p, outage: [200, 260] as [number, number] }
    const r = runStream({ ...q, allowedLateness: 1e9 }, generateEvents(q, mulberry32(9)))
    const w4 = r.windows[4]
    expect(w4.byArrival).toBeGreaterThan(w4.truth * 1.5)
    expect(r.windows[3].byArrival).toBeLessThan(r.windows[3].truth * 0.5)
  })

  it('processing-time windows keep the total but misplace events', () => {
    const r = runStream({ ...p, allowedLateness: 1e9 }, input)
    const byArrival = r.windows.reduce((s, w) => s + w.byArrival, 0)
    expect(byArrival).toBeLessThanOrEqual(input.length)
    expect(r.windows.some((w) => w.byArrival !== w.truth)).toBe(true)
  })
})

describe('partitioning', () => {
  it('day partitions prune a 7-day query to 7 of 90', () => {
    const c = queryCost(T, 'day', 'last7')
    expect(c.partitionsScanned).toBe(7)
    expect(c.bytesScanned).toBe(c.bytesNeeded)
  })

  it('a function on the partition column scans everything', () => {
    expect(queryCost(T, 'day', 'marchFn').partitionsScanned).toBe(90)
    expect(queryCost(T, 'day', 'march').partitionsScanned).toBe(31)
  })

  it('month partitions over-read for a 7-day query', () => {
    const c = queryCost(T, 'month', 'last7')
    expect(c.partitionsScanned).toBe(1)
    expect(c.bytesScanned / c.bytesNeeded).toBeCloseTo(31 / 7, 6)
  })

  it('user partitions: great for one user, terrible small files for everything else', () => {
    expect(partitions(T, 'user')).toHaveLength(50_000)
    expect(queryCost(T, 'user', 'oneUser').filesScanned).toBe(1)
    expect(queryCost(T, 'user', 'all').seconds).toBeGreaterThan(queryCost(T, 'day', 'all').seconds * 2)
  })

  it('skew: a 40% hot key makes one worker do 40%+ of the work; salting spreads it', () => {
    const plain = workerLoads(16, 0.4, 1)
    expect(Math.max(...plain)).toBeCloseTo(0.4 + 0.6 / 16, 10)
    const salted = workerLoads(16, 0.4, 16)
    expect(Math.max(...salted)).toBeCloseTo(1 / 16, 10)
    expect(plain.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
})
