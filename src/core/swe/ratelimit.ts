import type { Rng } from '../random.ts'

/**
 * Retries after an outage. Clients send requests at a steady rate to a server protected by a
 * token-bucket rate limiter (capacity per second, burst size). The server is down for a few
 * seconds; failed requests are retried with a strategy. Bad strategies keep the server overloaded
 * long after it is back (a retry storm); backoff with jitter lets it recover.
 */
export type Strategy = 'none' | 'immediate' | 'fixed' | 'exponential' | 'jitter'

export interface RetryParams {
  /** New requests per second from all clients together. */
  rate: number
  /** Requests per second the server accepts (token refill) and its burst size. */
  capacity: number
  burst: number
  outageStart: number
  outageEnd: number
  strategy: Strategy
  /** Base delay (s) for fixed/exponential/jitter. */
  baseDelay: number
  maxAttempts: number
  seconds: number
  /** Requests that all arrive at t = 0 (e.g. every client reconnecting after a restart). */
  initialBurst?: number
}

export interface Tick {
  t: number
  attempts: number
  accepted: number
  rejected: number
}

const DT = 0.05

export function delayFor(strategy: Strategy, attempt: number, base: number, rng: Rng): number {
  switch (strategy) {
    case 'immediate':
      return DT
    case 'fixed':
      return base
    case 'exponential':
      return base * 2 ** (attempt - 1)
    case 'jitter':
      return rng() * base * 2 ** (attempt - 1) // “full jitter”
    default:
      return Infinity
  }
}

export function simulateRetries(p: RetryParams, rng: Rng) {
  const ticks: Tick[] = []
  let tokens = p.burst
  // retries waiting, bucketed by the tick they are due in (attempt number kept per request)
  const due = new Map<number, number[]>()
  let dropped = 0
  let attemptsTotal = 0
  let carry = 0
  const nTicks = Math.round(p.seconds / DT)
  for (let i = 0; i < nTicks; i++) {
    const t = i * DT
    tokens = Math.min(p.burst, tokens + p.capacity * DT)
    carry += p.rate * DT
    const fresh = Math.floor(carry)
    carry -= fresh
    const queue: number[] = [...new Array(fresh + (i === 0 ? (p.initialBurst ?? 0) : 0)).fill(1), ...(due.get(i) ?? [])]
    due.delete(i)
    const down = t >= p.outageStart && t < p.outageEnd
    let accepted = 0
    let rejected = 0
    for (const attempt of queue) {
      attemptsTotal++
      if (!down && tokens >= 1) {
        tokens -= 1
        accepted++
        continue
      }
      rejected++
      if (attempt >= p.maxAttempts || p.strategy === 'none') {
        dropped++
        continue
      }
      const d = delayFor(p.strategy, attempt, p.baseDelay, rng)
      const at = i + Math.max(1, Math.round(d / DT))
      if (!due.has(at)) due.set(at, [])
      due.get(at)!.push(attempt + 1)
    }
    ticks.push({ t, attempts: queue.length, accepted, rejected })
  }
  // recovery: first moment after the outage when rejections stay under 1% of capacity for 2 s
  const per = (x: Tick) => x.rejected / DT
  let recovered = NaN
  for (let i = Math.round(p.outageEnd / DT); i < ticks.length; i++) {
    const window = ticks.slice(i, i + Math.round(2 / DT))
    if (window.length === Math.round(2 / DT) && window.every((x) => per(x) < p.capacity * 0.01)) {
      recovered = ticks[i].t - p.outageEnd
      break
    }
  }
  const peak = Math.max(...ticks.map((x) => x.attempts / DT))
  const lastAccepted = ticks.reduce((m, x) => (x.accepted > 0 ? x.t : m), 0)
  return { ticks, dropped, attemptsTotal, recovered, peak, lastAccepted }
}

/** Token bucket admission for a list of arrival times (seconds); returns which were admitted. */
export function tokenBucket(arrivals: readonly number[], rate: number, burst: number): boolean[] {
  let tokens = burst
  let last = 0
  return arrivals.map((t) => {
    tokens = Math.min(burst, tokens + (t - last) * rate)
    last = t
    if (tokens >= 1) {
      tokens -= 1
      return true
    }
    return false
  })
}
