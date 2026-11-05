import { describe, expect, it } from 'vitest'
import { planJoin, stageTime, type SparkParams } from '../../src/core/spark.ts'

const base: SparkParams = { factGb: 500, dimMb: 50, executors: 10, broadcastMb: 10, shufflePartitions: 200, skew: 0, aqe: false }

describe('stage scheduling', () => {
  it('waits for the slowest slot', () => {
    expect(stageTime([1, 1, 1, 1], 2)).toBe(2)
    expect(stageTime([10, 1, 1], 4)).toBe(10)
  })
})

describe('join planning', () => {
  it('a dimension above the threshold forces a shuffle; raising it broadcasts and is far faster', () => {
    const smj = planJoin(base)
    const bhj = planJoin({ ...base, broadcastMb: 100 })
    expect(smj.plan).toBe('sort-merge')
    expect(bhj.plan).toBe('broadcast')
    expect(bhj.totalSeconds).toBeLessThan(smj.totalSeconds / 4)
    expect(bhj.shuffleGb).toBe(0)
  })
  it('too few shuffle partitions spill; more partitions fix it', () => {
    expect(planJoin(base).spilledTasks).toBe(200)
    const more = planJoin({ ...base, shufflePartitions: 1000 })
    expect(more.spilledTasks).toBe(0)
    expect(more.totalSeconds).toBeLessThan(planJoin(base).totalSeconds * 0.7)
  })
  it('one hot key makes a straggler that more executors cannot fix, AQE can', () => {
    const skewed = { ...base, shufflePartitions: 1000, skew: 0.2 }
    const r = planJoin(skewed)
    expect(r.totalSeconds).toBeGreaterThan(3000)
    expect(planJoin({ ...skewed, executors: 20 }).totalSeconds).toBeGreaterThan(3000)
    expect(planJoin({ ...skewed, aqe: true }).totalSeconds).toBeLessThan(500)
  })
  it('broadcasting a huge table fails', () => {
    expect(planJoin({ ...base, dimMb: 5000, broadcastMb: 10000 }).plan).toBe('oom')
  })
})
