import { tracing, type Db } from '../../core/db.ts'
import {
  createSchema,
  deleteCustomer,
  diffAgainstSource,
  dropSchema,
  fullReload,
  incrementalLoad,
  insertCustomer,
  readSnapshots,
  readSource,
  readState,
  readTarget,
  snapshot,
  snapshotAsOf,
  sourceAsOf,
  updatePlan,
  type Customer,
  type Diff,
  type IncrementalOptions,
  type SnapRow,
} from '../../core/loads.ts'

export const PLANS = ['free', 'pro', 'enterprise'] as const

export interface LogEntry {
  tick: number
  label: string
  sql: string[]
}

export interface View {
  now: number
  source: Customer[]
  targetFull: (Customer & { loaded_at: number })[]
  targetIncr: (Customer & { loaded_at: number })[]
  diffFull: Diff[]
  diffIncr: Diff[]
  snaps: SnapRow[]
  state: { job: string; watermark: number | null; last_run: number }[]
  truthAt: Customer[]
  snapAt: Customer[]
  log: LogEntry[]
}

const SEED: [string, string][] = [
  ['Ana', 'free'],
  ['Bruno', 'pro'],
  ['Carla', 'free'],
  ['Davi', 'enterprise'],
  ['Eva', 'pro'],
]

const nextPlan = (plan: string) => PLANS[(PLANS.indexOf(plan as (typeof PLANS)[number]) + 1) % PLANS.length]

/**
 * The sandbox: one database, a logical clock, and a log of every action with the SQL it ran.
 * Each action happens at `now` and advances the clock (the incremental job takes two ticks).
 */
export class Sandbox {
  now = 1
  log: LogEntry[] = []
  private readonly base: Db

  constructor(base: Db) {
    this.base = base
  }

  private async act(label: string | (() => string), fn: (db: Db, now: number) => Promise<number | void>) {
    const sql: string[] = []
    const db = tracing(this.base, (s) => sql.push(s.replace(/\s+/g, ' ').trim()))
    const tick = this.now
    const ticks = (await fn(db, tick)) ?? 1
    this.log.unshift({ tick, label: typeof label === 'function' ? label() : label, sql })
    this.now += ticks
  }

  async reset(seed = true) {
    await dropSchema(this.base)
    await createSchema(this.base)
    this.now = 1
    this.log = []
    if (seed) {
      await this.act(`Source starts with ${SEED.length} customers`, async (db, now) => {
        for (const [i, [name, plan]] of SEED.entries()) await insertCustomer(db, { id: i + 1, name, plan }, now)
      })
    }
  }

  async insert(name: string, plan: string, backdateBy = 0) {
    const [{ id }] = await this.base.all<{ id: number }>(
      `SELECT coalesce(max(id), 0) + 1 AS id FROM source_log`,
    )
    const stamped = Math.max(0, this.now - backdateBy)
    await this.act(
      backdateBy > 0
        ? `Insert #${id} ${name} (${plan}), late: updated_at = ${stamped}`
        : `Insert #${id} ${name} (${plan})`,
      (db, now) => insertCustomer(db, { id, name, plan }, now, stamped),
    )
  }

  async update(id: number, plan: string) {
    await this.act(`Update #${id} → ${plan}`, (db, now) => updatePlan(db, id, plan, now))
  }

  async remove(id: number) {
    await this.act(`Hard-delete #${id}`, (db, now) => deleteCustomer(db, id, now))
  }

  async fullReload() {
    await this.act('Full reload', (db, now) => fullReload(db, now))
  }

  /** `changeDuringRun`: the first source customer changes plan while the job is running. */
  async incremental(opts: Omit<IncrementalOptions, 'duringRun'> & { changeDuringRun?: boolean }) {
    let label = ''
    await this.act(
      () => label,
      async (db, now) => {
        let changed = ''
        const duringRun = opts.changeDuringRun
          ? async (tick: number) => {
              const [first] = await readSource(db)
              if (!first) return
              const plan = nextPlan(first.plan)
              await updatePlan(db, first.id, plan, tick)
              changed = `; meanwhile #${first.id} → ${plan} at ${tick}`
            }
          : undefined
        const r = await incrementalLoad(db, now, { ...opts, duringRun })
        const mode = `${opts.write}, watermark = ${opts.watermark === 'maxLoaded' ? 'max(updated_at)' : 'job end time'}`
        label = r.crashed
          ? `Incremental (${mode}): loaded ${r.extracted} rows, then CRASHED before saving the watermark${changed}`
          : `Incremental (${mode}): ${r.extracted} rows ${r.previousWatermark < 0 ? '(first run: no watermark yet)' : `with updated_at > ${r.previousWatermark}`}; watermark → ${r.newWatermark}${changed}`
        return 2
      },
    )
  }

  async snapshot() {
    let label = ''
    await this.act(
      () => label,
      async (db, now) => {
        const r = await snapshot(db, now)
        label = `SCD2 snapshot: ${r.opened} versions opened, ${r.closed} closed`
      },
    )
  }

  /** Let time pass with nothing happening (so timelines have room). */
  async wait(ticks = 1) {
    this.now += ticks
  }

  async read(asOf: number): Promise<View> {
    const db = this.base
    return {
      now: this.now,
      source: await readSource(db),
      targetFull: await readTarget(db, 'target_full'),
      targetIncr: await readTarget(db, 'target_incr'),
      diffFull: await diffAgainstSource(db, 'target_full'),
      diffIncr: await diffAgainstSource(db, 'target_incr'),
      snaps: await readSnapshots(db),
      state: await readState(db),
      truthAt: await sourceAsOf(db, asOf),
      snapAt: await snapshotAsOf(db, asOf),
      log: [...this.log],
    }
  }
}
