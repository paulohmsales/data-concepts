/**
 * A Spark join cost model: fact (GB) ⋈ dimension (MB) on a cluster of executors × 4 cores.
 * Broadcast hash join ships the dimension to every executor and joins map-side; sort-merge join
 * shuffles both sides into `shufflePartitions` reduce tasks. Throughputs are rough but consistent.
 */
export interface SparkParams {
  factGb: number
  dimMb: number
  executors: number
  /** spark.sql.autoBroadcastJoinThreshold, MB (−1 disables) */
  broadcastMb: number
  shufflePartitions: number
  /** share of fact rows carrying one hot join key */
  skew: number
  /** adaptive query execution: split skewed partitions, coalesce small ones */
  aqe: boolean
}

export const CORES = 4
const SPLIT_MB = 128
const SCAN_MBPS = 100 // read + filter + project, per core
const SORT_MBPS = 50 // shuffle read + sort + merge join, per core
const NET_MBPS = 1000 // broadcast transfer, per executor
const MEM_PER_TASK_MB = 1024 // execution memory per core before spilling
const MAX_BROADCAST_MB = 2048 // beyond this the broadcast fails (driver/executor memory)
const TASK_OVERHEAD_S = 0.05
const AQE_TARGET_MB = 256

export type Plan = 'broadcast' | 'sort-merge' | 'oom'

export interface Task {
  mb: number
  seconds: number
  spilled: boolean
}

export interface SparkResult {
  plan: Plan
  mapSeconds: number
  reduceSeconds: number
  totalSeconds: number
  shuffleGb: number
  reduceTasks: Task[]
  spilledTasks: number
  slots: number
}

/** Longest-processing-time-first scheduling of tasks onto slots: the stage's wall-clock time. */
export function stageTime(durations: number[], slots: number): number {
  const sorted = [...durations].sort((a, b) => b - a)
  const load = new Array<number>(slots).fill(0)
  for (const d of sorted) {
    let i = 0
    for (let j = 1; j < slots; j++) if (load[j] < load[i]) i = j
    load[i] += d
  }
  return Math.max(0, ...load)
}

const reduceTask = (mb: number): Task => {
  const spilled = mb > MEM_PER_TASK_MB
  return { mb, spilled, seconds: TASK_OVERHEAD_S + (mb / SORT_MBPS) * (spilled ? 2 : 1) }
}

export function planJoin(p: SparkParams): SparkResult {
  const slots = p.executors * CORES
  const factMb = p.factGb * 1024
  const splits = Math.ceil(factMb / SPLIT_MB)
  const scan = stageTime(new Array<number>(splits).fill(TASK_OVERHEAD_S + SPLIT_MB / SCAN_MBPS), slots)
  const broadcast = p.broadcastMb >= 0 && p.dimMb <= p.broadcastMb
  if (broadcast) {
    if (p.dimMb > MAX_BROADCAST_MB) return { plan: 'oom', mapSeconds: scan, reduceSeconds: 0, totalSeconds: Infinity, shuffleGb: 0, reduceTasks: [], spilledTasks: 0, slots }
    const ship = (p.dimMb / NET_MBPS) * Math.log2(p.executors + 1) // torrent-style broadcast
    return { plan: 'broadcast', mapSeconds: scan + ship, reduceSeconds: 0, totalSeconds: scan + ship, shuffleGb: 0, reduceTasks: [], spilledTasks: 0, slots }
  }
  // sort-merge: both sides shuffled by key
  const totalMb = factMb + p.dimMb
  const even = (totalMb * (1 - p.skew)) / p.shufflePartitions
  let parts = Array.from({ length: p.shufflePartitions }, (_, i) => even + (i === 0 ? totalMb * p.skew : 0))
  if (p.aqe) {
    // skew join: split partitions > 5× median and > 256 MB into target-size chunks
    const median = [...parts].sort((a, b) => a - b)[parts.length >> 1]
    parts = parts.flatMap((mb) => (mb > 5 * median && mb > AQE_TARGET_MB ? new Array<number>(Math.ceil(mb / AQE_TARGET_MB)).fill(mb / Math.ceil(mb / AQE_TARGET_MB)) : [mb]))
    // coalesce: merge tiny partitions up to the target size
    const merged: number[] = []
    let acc = 0
    for (const mb of parts) {
      if (mb >= AQE_TARGET_MB) merged.push(mb)
      else if (acc + mb > AQE_TARGET_MB) {
        merged.push(acc)
        acc = mb
      } else acc += mb
    }
    if (acc > 0) merged.push(acc)
    parts = merged
  }
  const tasks = parts.map(reduceTask)
  // map side writes shuffle files: scan plus a write pass
  const mapSeconds = scan * 1.3
  const reduceSeconds = stageTime(
    tasks.map((t) => t.seconds),
    slots,
  )
  return {
    plan: 'sort-merge',
    mapSeconds,
    reduceSeconds,
    totalSeconds: mapSeconds + reduceSeconds,
    shuffleGb: totalMb / 1024,
    reduceTasks: tasks,
    spilledTasks: tasks.filter((t) => t.spilled).length,
    slots,
  }
}
