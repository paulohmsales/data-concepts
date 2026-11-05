import type { Rng } from './random.ts'

/**
 * Event time vs processing time. Events happen at `t` (event time) and reach the pipeline at
 * `arrival = t + delay`. Tumbling windows of `window` seconds are counted by event time.
 *
 * Watermark: "I believe I've seen everything up to here". Here: max event time seen so far minus
 * the allowed lateness. A window [s, s + w) is emitted once the watermark passes s + w; anything
 * for it arriving later is dropped as too late.
 */
export interface StreamParams {
  /** Events per second. */
  rate: number
  /** Seconds of event time simulated. */
  duration: number
  window: number
  /** Typical network/device delay (exponential mean), seconds. */
  meanDelay: number
  /** Share of events that come from devices that were offline (delay × 20). */
  stragglers: number
  allowedLateness: number
  /** Optional outage [from, to): events in it are buffered on devices and arrive after `to`. */
  outage?: [number, number]
}

export interface StreamEvent {
  t: number
  arrival: number
  window: number
  late: boolean
}

export interface WindowResult {
  window: number
  start: number
  /** Events that truly belong here (by event time). */
  truth: number
  /** Counted before the window closed. */
  counted: number
  dropped: number
  /** Processing time when the result was emitted. */
  emittedAt: number
  /** Counting by arrival time instead (processing-time windows). */
  byArrival: number
}

export function generateEvents(p: StreamParams, rng: Rng): { t: number; arrival: number }[] {
  const n = Math.round(p.rate * p.duration)
  const out = Array.from({ length: n }, () => {
    const t = rng() * p.duration
    const base = -p.meanDelay * Math.log(1 - rng())
    const delay = rng() < p.stragglers ? base * 20 + p.meanDelay * 5 : base
    let arrival = t + delay
    if (p.outage && arrival >= p.outage[0] && arrival < p.outage[1]) arrival = p.outage[1] + rng() * 10
    return { t, arrival }
  })
  return out.sort((a, b) => a.arrival - b.arrival)
}

export function runStream(p: StreamParams, input: { t: number; arrival: number }[]) {
  const nWindows = Math.ceil(p.duration / p.window)
  const closedAt = new Array<number>(nWindows).fill(Infinity)
  const counted = new Array<number>(nWindows).fill(0)
  const truth = new Array<number>(nWindows).fill(0)
  const byArrival = new Array<number>(nWindows).fill(0)
  const events: StreamEvent[] = []
  const watermarks: { at: number; watermark: number }[] = []
  let maxSeen = -Infinity
  let nextToClose = 0

  for (const e of input) {
    const w = Math.min(nWindows - 1, Math.floor(e.t / p.window))
    truth[w]++
    const aw = Math.floor(e.arrival / p.window)
    if (aw < nWindows) byArrival[aw]++
    const late = closedAt[w] <= e.arrival
    if (!late) counted[w]++
    events.push({ ...e, window: w, late })
    // advance the watermark after taking the event
    maxSeen = Math.max(maxSeen, e.t)
    const wm = maxSeen - p.allowedLateness
    watermarks.push({ at: e.arrival, watermark: wm })
    while (nextToClose < nWindows && wm >= (nextToClose + 1) * p.window) closedAt[nextToClose++] = e.arrival
  }
  // end of stream flushes whatever is still open
  const end = input.length ? input[input.length - 1].arrival : 0
  for (let w = nextToClose; w < nWindows; w++) closedAt[w] = end

  const windows: WindowResult[] = truth.map((tr, w) => ({
    window: w,
    start: w * p.window,
    truth: tr,
    counted: counted[w],
    dropped: tr - counted[w],
    emittedAt: closedAt[w],
    byArrival: byArrival[w],
  }))
  const dropped = windows.reduce((s, w) => s + w.dropped, 0)
  // latency: how long after a window's end its result came out (ignoring the end-of-stream flush)
  const flushed = windows.filter((w) => w.window < nextToClose)
  const latency = flushed.length ? flushed.reduce((s, w) => s + (w.emittedAt - (w.start + p.window)), 0) / flushed.length : NaN
  return { events, windows, watermarks, dropped, dropRate: dropped / Math.max(1, input.length), latency }
}
