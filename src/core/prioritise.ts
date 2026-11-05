/**
 * Cost of delay. Each project is worth `value` per week once shipped (its cost of delay) and takes
 * `weeks` of the whole team's time. Over a 52-week horizon, the value delivered is
 * Σ value × (52 − finish week). WSJF orders by value ÷ weeks.
 * With WIP > 1, the team splits across that many projects at once and loses `switchCost` of its
 * capacity per extra concurrent project to context switching.
 */
export interface Project {
  id: string
  name: string
  value: number
  weeks: number
}

export const BACKLOG: Project[] = [
  { id: 'exp', name: 'Experimentation platform', value: 10, weeks: 16 },
  { id: 'churn', name: 'Churn model', value: 8, weeks: 10 },
  { id: 'attr', name: 'Marketing attribution', value: 7, weeks: 8 },
  { id: 'catalog', name: 'Data catalog', value: 2, weeks: 6 },
  { id: 'recon', name: 'Fix finance reconciliation', value: 6, weeks: 3 },
  { id: 'dash', name: 'Self-serve revenue dashboard', value: 5, weeks: 2 },
  { id: 'dbt', name: 'dbt migration', value: 3, weeks: 5 },
  { id: 'cost', name: 'Warehouse cost clean-up', value: 4, weeks: 1 },
]
export const HORIZON = 52

export type Order = 'requested' | 'value' | 'shortest' | 'biggest' | 'wsjf'

export function order(o: Order, items: Project[] = BACKLOG): Project[] {
  const xs = [...items]
  if (o === 'value') return xs.sort((a, b) => b.value - a.value)
  if (o === 'shortest') return xs.sort((a, b) => a.weeks - b.weeks)
  if (o === 'biggest') return xs.sort((a, b) => b.weeks - a.weeks)
  if (o === 'wsjf') return xs.sort((a, b) => b.value / b.weeks - a.value / a.weeks)
  return xs
}

export interface Delivery {
  id: string
  name: string
  start: number
  finish: number
  value: number
}

export interface Plan {
  deliveries: Delivery[]
  /** total value delivered within the horizon */
  delivered: number
  /** value an instant, free delivery of everything would give, minus delivered */
  lost: number
  /** cumulative value by week */
  curve: { week: number; total: number }[]
}

/** Work through `items` in order, `wip` at a time, sharing capacity equally. */
export function plan(o: Order, wip = 1, switchCost = 0.15): Plan {
  const queue = order(o)
  const remaining = new Map(queue.map((p) => [p.id, p.weeks]))
  const started = new Map<string, number>()
  const deliveries: Delivery[] = []
  const dt = 0.05
  let active: Project[] = []
  for (let t = 0; t < 200 && deliveries.length < queue.length; t += dt) {
    while (active.length < wip && queue.length > active.length + deliveries.length) {
      const next = queue.find((p) => !active.includes(p) && !deliveries.some((d) => d.id === p.id))
      if (!next) break
      active.push(next)
      started.set(next.id, t)
    }
    const rate = Math.max(0.1, 1 - switchCost * (active.length - 1)) / active.length
    for (const p of active) remaining.set(p.id, remaining.get(p.id)! - rate * dt)
    for (const p of active.filter((x) => remaining.get(x.id)! <= 1e-9)) {
      deliveries.push({ id: p.id, name: p.name, start: started.get(p.id)!, finish: Math.round((t + dt) * 100) / 100, value: p.value })
    }
    active = active.filter((x) => remaining.get(x.id)! > 1e-9)
  }
  const delivered = deliveries.reduce((a, d) => a + d.value * Math.max(0, HORIZON - d.finish), 0)
  const ideal = BACKLOG.reduce((a, p) => a + p.value * HORIZON, 0)
  const curve = Array.from({ length: HORIZON + 1 }, (_, w) => ({
    week: w,
    total: deliveries.reduce((a, d) => a + d.value * Math.max(0, w - d.finish), 0),
  }))
  return { deliveries, delivered, lost: ideal - delivered, curve }
}
