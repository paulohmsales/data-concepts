/**
 * A KPI tree: revenue = sessions × conversion × average order value (AOV), across three channels.
 * Week-over-week change is decomposed additively (log-mean Divisia, LMDI) into traffic, conversion
 * and AOV effects, and the conversion effect is split into channel-mix and within-channel rate.
 */
export interface Channel {
  key: string
  sessions: number
  conversion: number
  aov: number
}

export const BASE: Channel[] = [
  { key: 'organic', sessions: 50_000, conversion: 0.03, aov: 60 },
  { key: 'paid', sessions: 30_000, conversion: 0.015, aov: 55 },
  { key: 'email', sessions: 20_000, conversion: 0.05, aov: 70 },
]

export interface Changes {
  /** relative change per channel, e.g. { paid: 0.6 } = +60% */
  sessions: Record<string, number>
  conversion: Record<string, number>
  aov: Record<string, number>
}

export function apply(base: Channel[], ch: Changes): Channel[] {
  return base.map((c) => ({
    key: c.key,
    sessions: c.sessions * (1 + (ch.sessions[c.key] ?? 0)),
    conversion: c.conversion * (1 + (ch.conversion[c.key] ?? 0)),
    aov: c.aov * (1 + (ch.aov[c.key] ?? 0)),
  }))
}

export interface Totals {
  sessions: number
  orders: number
  conversion: number
  aov: number
  revenue: number
}

export function totals(cs: Channel[]): Totals {
  const sessions = cs.reduce((a, c) => a + c.sessions, 0)
  const orders = cs.reduce((a, c) => a + c.sessions * c.conversion, 0)
  const revenue = cs.reduce((a, c) => a + c.sessions * c.conversion * c.aov, 0)
  return { sessions, orders, conversion: orders / sessions, aov: revenue / orders, revenue }
}

const logMean = (a: number, b: number) => (Math.abs(a - b) < 1e-9 ? a : (a - b) / (Math.log(a) - Math.log(b)))

export interface Decomposition {
  before: Totals
  after: Totals
  traffic: number
  mix: number
  rate: number
  aov: number
}

/** Additive decomposition of the revenue change; traffic + mix + rate + aov = after − before exactly. */
export function decompose(before: Channel[], after: Channel[]): Decomposition {
  const b = totals(before)
  const a = totals(after)
  const L = logMean(a.revenue, b.revenue)
  const traffic = L * Math.log(a.sessions / b.sessions)
  const conv = L * Math.log(a.conversion / b.conversion)
  const aov = L * Math.log(a.aov / b.aov)
  // split the overall conversion change into mix (who arrives) and rate (how each channel converts)
  const share = (cs: Channel[], t: Totals) => cs.map((c) => c.sessions / t.sessions)
  const w0 = share(before, b)
  const w1 = share(after, a)
  const mixD = w1.reduce((s, w, i) => s + (w - w0[i]) * before[i].conversion, 0)
  const rateD = w1.reduce((s, w, i) => s + w * (after[i].conversion - before[i].conversion), 0)
  const total = mixD + rateD
  const mix = total === 0 ? 0 : (conv * mixD) / total
  const rate = total === 0 ? 0 : conv - mix
  return { before: b, after: a, traffic, mix, rate, aov }
}
