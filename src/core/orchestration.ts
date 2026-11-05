/**
 * A scheduler simulation. One DAG (extract → two staging tasks → join → publish) runs once per day.
 * A backfill of N past days is queued at 05:00; today's run is queued at 06:00 with an SLA of
 * 08:00. Tasks share a pool of worker slots and are never pre-empted once started.
 */
export interface Task {
  id: string
  minutes: number
  deps: string[]
}

export const TASKS: Task[] = [
  { id: 'extract', minutes: 10, deps: [] },
  { id: 'stg_orders', minutes: 15, deps: ['extract'] },
  { id: 'stg_events', minutes: 20, deps: ['extract'] },
  { id: 'join', minutes: 25, deps: ['stg_orders', 'stg_events'] },
  { id: 'publish', minutes: 5, deps: ['join'] },
]
export const CRITICAL_PATH = 60
/** minutes after 05:00 */
export const TODAY_QUEUED = 60
export const SLA = 180

export interface SchedParams {
  backfillDays: number
  slots: number
  maxActiveRuns: number
  priority: 'fifo' | 'today-first'
  dependsOnPast: boolean
}

export interface Slot {
  /** 0 = today, 1 = yesterday, … */
  run: number
  task: string
  start: number
  end: number
}

export interface SchedResult {
  slots: Slot[]
  todayDone: number
  backfillDone: number
  slaMet: boolean
  utilisation: number
}

export function schedule(p: SchedParams): SchedResult {
  const runs = Array.from({ length: p.backfillDays + 1 }, (_, i) => i) // 0 = today
  const done = new Map<string, number>() // `${run}:${task}` → end time
  const started = new Set<string>()
  const out: Slot[] = []
  const running: Slot[] = []
  const key = (r: number, t: string) => `${r}:${t}`
  const runDone = (r: number) => done.has(key(r, 'publish'))
  const total = runs.length * TASKS.length

  for (let t = 0; out.length < total && t < 20_000; t++) {
    // finish tasks
    for (let i = running.length - 1; i >= 0; i--)
      if (running[i].end <= t) {
        done.set(key(running[i].run, running[i].task), running[i].end)
        running.splice(i, 1)
      }
    // which backfill runs are active: the oldest unfinished ones, up to maxActiveRuns (today is its own DAG run)
    const backlog = runs.filter((r) => r > 0 && !runDone(r)).sort((a, b) => b - a)
    const active = new Set(backlog.slice(0, p.maxActiveRuns))
    if (t >= TODAY_QUEUED) active.add(0)

    const ready: { run: number; task: Task; queued: number }[] = []
    for (const r of active)
      for (const task of TASKS) {
        const k = key(r, task.id)
        if (started.has(k)) continue
        if (!task.deps.every((d) => done.has(key(r, d)))) continue
        // depends_on_past: wait for the same task of the previous day (oldest backfill day has no past)
        if (p.dependsOnPast && r < p.backfillDays && !done.has(key(r + 1, task.id))) continue
        const depEnd = Math.max(r === 0 ? TODAY_QUEUED : 0, ...task.deps.map((d) => done.get(key(r, d)) ?? 0))
        ready.push({ run: r, task, queued: depEnd })
      }
    ready.sort((a, b) =>
      p.priority === 'today-first' && (a.run === 0) !== (b.run === 0)
        ? a.run === 0
          ? -1
          : 1
        : a.queued - b.queued || b.run - a.run || TASKS.indexOf(a.task) - TASKS.indexOf(b.task),
    )
    for (const r of ready) {
      if (running.length >= p.slots) break
      const s = { run: r.run, task: r.task.id, start: t, end: t + r.task.minutes }
      running.push(s)
      out.push(s)
      started.add(key(r.run, r.task.id))
    }
  }
  const end = Math.max(...out.map((s) => s.end))
  const todayDone = out.find((s) => s.run === 0 && s.task === 'publish')!.end
  const backfillDone = Math.max(0, ...out.filter((s) => s.run > 0).map((s) => s.end))
  const busy = out.reduce((a, s) => a + (s.end - s.start), 0)
  return { slots: out, todayDone, backfillDone, slaMet: todayDone <= SLA, utilisation: busy / (end * p.slots) }
}

/** "05:00 + m minutes" as a clock time. */
export const clock = (m: number) => {
  const total = 5 * 60 + m
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
