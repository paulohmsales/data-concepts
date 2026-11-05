import { describe, expect, it } from 'vitest'
import { Sandbox } from '../../src/modules/snapshots/sandbox.ts'
import { scenarios } from '../../src/modules/snapshots/scenarios.ts'
import { nodeDb } from '../helpers/nodeDb.ts'

async function run(id: string) {
  const s = new Sandbox(await nodeDb())
  await s.reset()
  const scenario = scenarios.find((x) => x.id === id)!
  await scenario.run(s)
  const view = await s.read(scenario.asOf?.(s) ?? s.now)
  const status = (diffs: { id: number; status: string }[]) => Object.fromEntries(diffs.map((d) => [d.id, d.status]))
  return { s, view, full: status(view.diffFull), incr: status(view.diffIncr) }
}

// Each Break-it scenario must show the failure it describes.
describe('snapshots scenarios', () => {
  it('hard delete → ghost in incremental, gone from full, closed in snapshot', async () => {
    const { view, full, incr } = await run('hard-delete')
    expect(incr[2]).toBe('ghost')
    expect(full[2]).toBeUndefined()
    expect(view.snaps.filter((r) => r.id === 2).every((r) => r.valid_to !== null)).toBe(true)
  })

  it('late row → missing from incremental, present in full', async () => {
    const { full, incr } = await run('late-row')
    expect(incr[6]).toBe('missing')
    expect(full[6]).toBe('ok')
  })

  it('crash + append retry → every row duplicated', async () => {
    const { incr } = await run('crash-append')
    expect(new Set(Object.values(incr))).toEqual(new Set(['duplicate']))
  })

  it('crash + merge retry → all ok', async () => {
    const { incr } = await run('crash-merge')
    expect(new Set(Object.values(incr))).toEqual(new Set(['ok']))
  })

  it('mid-run change + job-end watermark → stale for good', async () => {
    const { incr } = await run('mid-run-job-end')
    expect(incr[1]).toBe('stale')
  })

  it('mid-run change + max(updated_at) watermark → caught on the next run', async () => {
    const { incr } = await run('mid-run-max')
    expect(new Set(Object.values(incr))).toEqual(new Set(['ok']))
  })

  it('two changes between snapshots → snapshot disagrees with the truth at T', async () => {
    const { view } = await run('between-snapshots')
    expect(view.truthAt.find((c) => c.id === 3)?.plan).toBe('enterprise')
    expect(view.snapAt.find((c) => c.id === 3)?.plan).toBe('free')
  })

  it('dashboard at T → snapshot reproduces the truth at a snapshot tick', async () => {
    const { s } = await run('dashboard-at-t')
    const snapTicks = s.log.filter((e) => e.label.startsWith('SCD2')).map((e) => e.tick)
    for (const t of snapTicks) {
      const v = await s.read(t)
      expect(v.snapAt.map((c) => [c.id, c.plan])).toEqual(v.truthAt.map((c) => [c.id, c.plan]))
    }
  })
})
