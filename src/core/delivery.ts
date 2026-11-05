import type { Rng } from './random.ts'

/**
 * Delivery semantics over a flaky network. A producer sends events to a sink. Each attempt:
 *   - the request is lost before the sink sees it (pRequestLost), or
 *   - the sink writes it, but the acknowledgement is lost (pAckLost), or
 *   - the sink writes it and the producer gets the ack.
 * Without an ack, the producer can't tell the first two cases apart.
 */
export interface DeliveryParams {
  events: number
  pRequestLost: number
  pAckLost: number
  /** at-most-once: send once. at-least-once: retry until acked (up to maxAttempts). */
  retry: 'at-most-once' | 'at-least-once'
  maxAttempts: number
  /** append: INSERT every write. upsert: write keyed by event id (a repeat overwrites itself). */
  sink: 'append' | 'upsert'
}

export type AttemptOutcome = 'request lost' | 'written, ack lost' | 'written, acked'

export interface Attempt {
  event: number
  attempt: number
  outcome: AttemptOutcome
}

export function simulateDelivery(p: DeliveryParams, rng: Rng) {
  const attempts: Attempt[] = []
  const writes = new Map<number, number>() // event → times written
  for (let e = 0; e < p.events; e++) {
    const max = p.retry === 'at-most-once' ? 1 : p.maxAttempts
    for (let a = 1; a <= max; a++) {
      const r = rng()
      const outcome: AttemptOutcome =
        r < p.pRequestLost ? 'request lost' : rng() < p.pAckLost ? 'written, ack lost' : 'written, acked'
      attempts.push({ event: e, attempt: a, outcome })
      if (outcome !== 'request lost') writes.set(e, (writes.get(e) ?? 0) + 1)
      if (outcome === 'written, acked') break
    }
  }
  const delivered = writes.size
  const rawWrites = [...writes.values()].reduce((s, x) => s + x, 0)
  const rows = p.sink === 'append' ? rawWrites : delivered
  return {
    attempts,
    /** Rows in the sink. */
    rows,
    /** Distinct events that made it. */
    delivered,
    lost: p.events - delivered,
    duplicates: rows - delivered,
  }
}

/** Theory for unlimited retries: each event is written 1/(1 − pAckLost) times on average. */
export const expectedWritesPerEvent = (pAckLost: number) => 1 / (1 - pAckLost)
