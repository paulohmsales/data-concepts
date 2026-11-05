import { normal, type Rng } from './random.ts'

/**
 * A ride marketplace in half-hour slots. Demand follows a daily shape (peaks at 8:00 and 18:00) with
 * noise; driver capacity per slot is fixed. A rider discount raises demand by `lift`.
 * Completed rides in a slot = min(demand, capacity).
 *
 * - Truth: everyone discounted vs nobody, over the same days.
 * - User-level A/B: half the riders discounted in every slot; both groups share the same drivers.
 * - Switchback: whole slots (blocks of `blockSlots`) randomly discounted or not.
 */
export const SLOTS_PER_DAY = 48

export interface SwitchParams {
  /** drivers' capacity as a multiple of average demand */
  capacity: number
  lift: number
  days: number
  /** slots per switchback block (1 = 30 min, 8 = 4 h) */
  blockSlots: number
  noise: number
}

const shape = (slot: number) => {
  const h = slot / 2
  return 0.35 + 1.1 * Math.exp(-((h - 8) ** 2) / 3) + 1.3 * Math.exp(-((h - 18) ** 2) / 4) + 0.45 * Math.exp(-((h - 13) ** 2) / 8)
}
const MEAN_SHAPE = Array.from({ length: SLOTS_PER_DAY }, (_, s) => shape(s)).reduce((a, b) => a + b, 0) / SLOTS_PER_DAY

export function demandSeries(p: SwitchParams, rng: Rng): number[] {
  const out: number[] = []
  for (let d = 0; d < p.days; d++) {
    const dayLevel = 1 + 0.08 * normal(rng)
    for (let s = 0; s < SLOTS_PER_DAY; s++) out.push((100 * shape(s) * dayLevel * Math.max(0.2, 1 + p.noise * normal(rng))) / MEAN_SHAPE)
  }
  return out
}

export interface Estimates {
  truth: number
  userAB: number
  switchback: number
}

export function runOnce(p: SwitchParams, rng: Rng): Estimates {
  const demand = demandSeries(p, rng)
  const cap = 100 * p.capacity
  const rides = (d: number) => Math.min(d, cap)
  const allOff = demand.reduce((a, d) => a + rides(d), 0)
  const allOn = demand.reduce((a, d) => a + rides(d * (1 + p.lift)), 0)
  // user-level: per slot, both halves share the capacity in proportion to their demand
  let tRides = 0
  let cRides = 0
  for (const d of demand) {
    const dt = 0.5 * d * (1 + p.lift)
    const dc = 0.5 * d
    const served = Math.min(1, cap / (dt + dc))
    tRides += dt * served
    cRides += dc * served
  }
  // switchback: blocks of slots assigned at random
  let onSum = 0
  let onN = 0
  let offSum = 0
  let offN = 0
  for (let start = 0; start < demand.length; start += p.blockSlots) {
    const treated = rng() < 0.5
    for (let i = start; i < Math.min(demand.length, start + p.blockSlots); i++) {
      if (treated) {
        onSum += rides(demand[i] * (1 + p.lift))
        onN++
      } else {
        offSum += rides(demand[i])
        offN++
      }
    }
  }
  const sb = onN && offN ? onSum / onN / (offSum / offN) - 1 : 0
  return { truth: allOn / allOff - 1, userAB: tRides / cRides - 1, switchback: sb }
}

export interface Replicated {
  runs: Estimates[]
  truth: number
  userAB: { mean: number; sd: number }
  switchback: { mean: number; sd: number }
}

const meanSd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) }
}

export function replicate(p: SwitchParams, n: number, rng: Rng): Replicated {
  const runs = Array.from({ length: n }, () => runOnce(p, rng))
  return {
    runs,
    truth: meanSd(runs.map((r) => r.truth)).mean,
    userAB: meanSd(runs.map((r) => r.userAB)),
    switchback: meanSd(runs.map((r) => r.switchback)),
  }
}
