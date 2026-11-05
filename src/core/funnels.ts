import type { Rng } from './random.ts'

/**
 * Funnels from an event log. Each user may do: visit → signup → cart → purchase.
 * Real logs are messy: some users check out as guests (no signup event at all), some buyers come
 * back days later, and bots generate visits only.
 */
export const STEPS = ['visit', 'signup', 'cart', 'purchase'] as const
export type Step = (typeof STEPS)[number]

export interface Event {
  user: number
  step: Step
  /** Hours since the user's first event. */
  t: number
}

export interface FunnelParams {
  users: number
  /** P(next step | reached this one). */
  rates: [number, number, number]
  /** Mean hours between steps. */
  meanGapHours: number
  /** Share of users who reach the cart who never sign up (guest checkout). */
  guests: number
  /** Share of purchasers who come back days later (gap × 10). */
  slowBuyers: number
  /** Bot "users": visit only. */
  bots: number
}

export function simulateEvents(p: FunnelParams, rng: Rng): Event[] {
  const events: Event[] = []
  const gap = () => -p.meanGapHours * Math.log(1 - rng())
  for (let u = 0; u < p.users; u++) {
    let t = 0
    const steps: Step[] = ['visit']
    for (let i = 0; i < 3; i++) {
      if (rng() >= p.rates[i]) break
      steps.push(STEPS[i + 1])
    }
    const guest = steps.includes('cart') && rng() < p.guests
    const slow = rng() < p.slowBuyers
    const done = guest ? steps.filter((s) => s !== 'signup') : steps
    done.forEach((step, i) => {
      if (i > 0) t += step === 'purchase' && slow ? gap() * 10 : gap()
      events.push({ user: u, step, t })
    })
  }
  for (let b = 0; b < p.bots; b++) events.push({ user: p.users + b, step: 'visit', t: 0 })
  return events
}

/** Users who did each step at all, in any order (what a naive COUNT DISTINCT per event gives). */
export function naiveFunnel(events: readonly Event[]): number[] {
  return STEPS.map((s) => new Set(events.filter((e) => e.step === s).map((e) => e.user)).size)
}

/**
 * Ordered funnel: a user counts at step i if they did steps 0..i in that order, each after the
 * previous one, and all within `windowHours` of their first step.
 */
export function orderedFunnel(events: readonly Event[], windowHours: number): number[] {
  const byUser = new Map<number, Event[]>()
  for (const e of events) {
    if (!byUser.has(e.user)) byUser.set(e.user, [])
    byUser.get(e.user)!.push(e)
  }
  const counts = new Array<number>(STEPS.length).fill(0)
  for (const evs of byUser.values()) {
    evs.sort((a, b) => a.t - b.t)
    let reached = -1
    let start = 0
    let last = -Infinity
    for (const e of evs) {
      const next = STEPS[reached + 1]
      if (e.step !== next || e.t < last) continue
      if (reached === -1) start = e.t
      else if (e.t - start > windowHours) break
      reached++
      last = e.t
      if (reached === STEPS.length - 1) break
    }
    for (let i = 0; i <= reached; i++) counts[i]++
  }
  return counts
}
