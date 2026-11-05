import { describe, expect, it } from 'vitest'
import { CRITICAL_PATH, schedule, SLA, TODAY_QUEUED, type SchedParams } from '../../src/core/orchestration.ts'

const base: SchedParams = { backfillDays: 30, slots: 4, maxActiveRuns: 16, priority: 'fifo', dependsOnPast: false }

describe('scheduler', () => {
  it('alone, today finishes after its critical path', () => {
    expect(schedule({ ...base, backfillDays: 0 }).todayDone).toBe(TODAY_QUEUED + CRITICAL_PATH)
  })
  it('a FIFO backfill starves today and misses the SLA', () => {
    const r = schedule(base)
    expect(r.slaMet).toBe(false)
    expect(r.todayDone).toBeGreaterThan(SLA + 200)
  })
  it('priority for today meets the SLA without slowing the backfill', () => {
    const fifo = schedule(base)
    const pri = schedule({ ...base, priority: 'today-first' })
    expect(pri.slaMet).toBe(true)
    expect(pri.backfillDone).toBe(fifo.backfillDone)
  })
  it('limiting active runs protects today but stretches the backfill', () => {
    const r = schedule({ ...base, maxActiveRuns: 2 })
    expect(r.slaMet).toBe(true)
    expect(r.backfillDone).toBeGreaterThan(schedule(base).backfillDone * 1.4)
  })
  it('depends_on_past makes today wait for the whole backfill, whatever the priority', () => {
    const r = schedule({ ...base, dependsOnPast: true, priority: 'today-first' })
    expect(r.slaMet).toBe(false)
    expect(r.todayDone).toBeGreaterThan(r.backfillDone)
  })
  it('more slots alone do not fix FIFO starvation', () => {
    expect(schedule({ ...base, slots: 8 }).slaMet).toBe(false)
  })
  it('every task runs once, after its dependencies', () => {
    const r = schedule(base)
    expect(r.slots.length).toBe(31 * 5)
    for (const s of r.slots.filter((x) => x.task === 'join')) {
      const deps = r.slots.filter((x) => x.run === s.run && (x.task === 'stg_orders' || x.task === 'stg_events'))
      expect(Math.max(...deps.map((d) => d.end))).toBeLessThanOrEqual(s.start)
    }
  })
})
