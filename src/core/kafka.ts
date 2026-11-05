/**
 * A Kafka topic and one consumer group, simulated per second for 300 s.
 * Producers write `rate` messages/s; a share `hotShare` of them carry one hot key (so they all land
 * on partition 0), the rest spread evenly across partitions. Partitions are assigned round-robin
 * to consumers; each consumer processes up to `capacity` messages/s across its partitions.
 * Optionally the group scales out by 3 consumers at t = 100 s, which triggers a rebalance.
 */
export const SECONDS = 300
export const SCALE_AT = 100
export const EXTRA_CONSUMERS = 3

export interface KafkaParams {
  partitions: number
  consumers: number
  rate: number
  capacity: number
  hotShare: number
  scaleOut: boolean
  protocol: 'eager' | 'cooperative'
}

/** eager: every partition stops while the whole group re-joins; cooperative: only moved partitions pause, briefly */
const PAUSE = { eager: 10, cooperative: 3 }

export interface KafkaResult {
  /** lag[t][p] at the end of second t */
  lag: number[][]
  idleConsumers: number
  maxLag: number
  finalLag: number
  /** steady inbound rate per partition */
  inbound: number[]
  /** most a single consumer can give one partition */
  perPartitionCeiling: number
}

export const assign = (partitions: number, consumers: number) => Array.from({ length: partitions }, (_, p) => p % consumers)

export function simulateKafka(k: KafkaParams): KafkaResult {
  const inbound = Array.from({ length: k.partitions }, (_, p) => (k.rate * (1 - k.hotShare)) / k.partitions + (p === 0 ? k.rate * k.hotShare : 0))
  const backlog = new Array<number>(k.partitions).fill(0)
  const lag: number[][] = []
  const before = assign(k.partitions, k.consumers)
  const after = assign(k.partitions, k.consumers + EXTRA_CONSUMERS)
  for (let t = 0; t < SECONDS; t++) {
    const scaled = k.scaleOut && t >= SCALE_AT
    const owner = scaled ? after : before
    const nConsumers = scaled ? k.consumers + EXTRA_CONSUMERS : k.consumers
    const pausing = k.scaleOut && t >= SCALE_AT && t < SCALE_AT + PAUSE[k.protocol]
    for (let p = 0; p < k.partitions; p++) backlog[p] += inbound[p]
    for (let c = 0; c < nConsumers; c++) {
      const mine = owner.flatMap((o, p) => (o === c ? [p] : []))
      // a paused partition can't be consumed this second
      const live = mine.filter((p) => !(pausing && (k.protocol === 'eager' || before[p] !== after[p])))
      const demand = live.reduce((a, p) => a + backlog[p], 0)
      if (demand === 0) continue
      const budget = Math.min(k.capacity, demand)
      for (const p of live) backlog[p] -= budget * (backlog[p] / demand)
    }
    lag.push(backlog.map((b) => Math.max(0, Math.round(b))))
  }
  const final = lag[SECONDS - 1]
  const finalConsumers = k.scaleOut ? k.consumers + EXTRA_CONSUMERS : k.consumers
  return {
    lag,
    idleConsumers: Math.max(0, finalConsumers - k.partitions),
    maxLag: Math.max(...lag.map((r) => r.reduce((a, b) => a + b, 0))),
    finalLag: final.reduce((a, b) => a + b, 0),
    inbound,
    perPartitionCeiling: k.capacity,
  }
}

/** Which partition a key goes to: hash(key) mod partitions (murmur2 in Kafka; any stable hash here). */
export function partitionFor(key: string, partitions: number): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) % partitions
}
