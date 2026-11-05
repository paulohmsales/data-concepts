import { describe, expect, it } from 'vitest'
import { simulateLake, type LakeParams } from '../../src/core/lakehouse.ts'

const base: LakeParams = { appendsPerHour: 1, compaction: 'none', writeMode: 'cow', updatesPerDay: 0, updatePattern: 'clustered', retentionDays: 7 }
const last = (p: Partial<LakeParams>) => {
  const r = simulateLake({ ...base, ...p })
  return { ...r.series[r.series.length - 1], wa: r.writeAmplification }
}

describe('lakehouse table', () => {
  it('minute-level appends create thousands of small files and slow every scan', () => {
    const hourly = last({})
    const minute = last({ appendsPerHour: 60 })
    expect(minute.files).toBe(60 * 168)
    expect(minute.querySec).toBeGreaterThan(hourly.querySec * 3)
  })
  it('compaction restores scan speed at the cost of rewriting data once', () => {
    const c = last({ appendsPerHour: 60, compaction: 'hourly' })
    expect(c.files).toBeLessThan(200)
    expect(c.wa).toBeCloseTo(2, 1)
  })
  it('scattered copy-on-write updates rewrite the table again and again', () => {
    const scattered = last({ updatesPerDay: 4, updatePattern: 'scattered' })
    const clustered = last({ updatesPerDay: 4, updatePattern: 'clustered' })
    expect(scattered.wa).toBeGreaterThan(10)
    expect(clustered.wa).toBeLessThan(2)
    expect(scattered.storageGb).toBeGreaterThan(scattered.liveGb * 10)
  })
  it('merge-on-read writes little but makes reads pay until compaction', () => {
    const mor = last({ updatesPerDay: 4, updatePattern: 'scattered', writeMode: 'mor' })
    expect(mor.wa).toBeLessThan(1.1)
    expect(mor.querySec).toBeGreaterThan(last({}).querySec * 2)
    expect(last({ updatesPerDay: 4, updatePattern: 'scattered', writeMode: 'mor', compaction: 'daily' }).deleteFiles).toBe(0)
  })
  it('retention decides how much history you store', () => {
    expect(last({ updatesPerDay: 4, updatePattern: 'scattered', retentionDays: 0 }).storageGb).toBeCloseTo(168, 0)
    expect(last({ updatesPerDay: 4, updatePattern: 'scattered', retentionDays: 1 }).storageGb).toBeGreaterThan(500)
  })
})
