import type { Sandbox } from './sandbox.ts'

export interface Scenario {
  id: string
  title: string
  setup: string
  lookFor: string
  /** Where to put the "as of T" slider afterwards, if the scenario is about history. */
  asOf?: (s: Sandbox) => number
  run: (s: Sandbox) => Promise<void>
}

const CORRECT = { write: 'merge', watermark: 'maxLoaded' } as const

export const scenarios: Scenario[] = [
  {
    id: 'hard-delete',
    title: 'A hard delete',
    setup: 'Load everything, hard-delete Bruno in the source, then run all three jobs again.',
    lookFor:
      'The incremental target still has Bruno: a deleted row has no updated_at left to find, so the watermark query never sees it (a “ghost”). The full reload drops him; the snapshot closes his version.',
    run: async (s) => {
      await s.fullReload()
      await s.incremental(CORRECT)
      await s.snapshot()
      await s.remove(2)
      await s.fullReload()
      await s.incremental(CORRECT)
      await s.snapshot()
    },
  },
  {
    id: 'late-row',
    title: 'A late-arriving row',
    setup:
      'Load incrementally, change Ana (watermark moves forward), then a row shows up whose updated_at is older than the watermark (e.g. a lagging replica). Load again.',
    lookFor:
      'The incremental target is missing the late row: it fails updated_at > watermark forever. The full reload has it. Real fixes: a lookback window (updated_at > watermark − N) with a merge, or an append-only ingestion timestamp.',
    run: async (s) => {
      await s.incremental(CORRECT)
      await s.update(1, 'pro')
      await s.incremental(CORRECT)
      await s.insert('Fábio', 'free', 4)
      await s.incremental(CORRECT)
      await s.fullReload()
    },
  },
  {
    id: 'crash-append',
    title: 'Crash, then retry (append)',
    setup:
      'An append-only incremental job loads its rows, then crashes before saving the watermark. The scheduler retries it.',
    lookFor:
      'Every row is in the target twice. The retry re-extracted the same rows (the watermark never moved) and INSERT added them again. The job is not idempotent.',
    run: async (s) => {
      await s.incremental({ write: 'append', watermark: 'maxLoaded', crashBeforeWatermark: true })
      await s.incremental({ write: 'append', watermark: 'maxLoaded' })
    },
  },
  {
    id: 'crash-merge',
    title: 'Crash, then retry (merge)',
    setup: 'The same crash and retry, but the job merges by key (delete the batch’s keys, then insert).',
    lookFor:
      'No duplicates. Replacing by key makes the job idempotent: running it twice on the same input gives the same table, so retries are safe.',
    run: async (s) => {
      await s.incremental({ ...CORRECT, crashBeforeWatermark: true })
      await s.incremental(CORRECT)
    },
  },
  {
    id: 'mid-run-job-end',
    title: 'Source changes mid-run (watermark = job end time)',
    setup:
      'While the incremental job runs, Ana changes plan. The job then saves its finish time as the watermark. Run it again later.',
    lookFor:
      'Ana is stale in the target, and stays stale: her change is stamped with a time ≤ the saved watermark, so no later run will ever select it. The source changed between extract and finish.',
    run: async (s) => {
      await s.incremental({ write: 'merge', watermark: 'jobEnd', changeDuringRun: true })
      await s.incremental({ write: 'merge', watermark: 'jobEnd' })
      await s.incremental({ write: 'merge', watermark: 'jobEnd' })
    },
  },
  {
    id: 'mid-run-max',
    title: 'Source changes mid-run (watermark = max(updated_at))',
    setup: 'The same change during the run, but the watermark is the newest updated_at the job actually loaded.',
    lookFor:
      'After the first run Ana is stale (the change happened after extraction), but the next run picks her up: the watermark only claims what was really loaded.',
    run: async (s) => {
      await s.incremental({ ...CORRECT, changeDuringRun: true })
      await s.incremental(CORRECT)
    },
  },
  {
    id: 'between-snapshots',
    title: 'Two changes between snapshots',
    setup:
      'Snapshot, then Carla upgrades to enterprise and downgrades back to free before the next snapshot runs.',
    lookFor:
      'Move the “as of T” slider to the tick of the upgrade: the truth says enterprise, the snapshot says free. A snapshot only sees the state at run time; whatever happened in between is gone. Snapshot often enough for the questions you’ll ask.',
    asOf: (s) => s.log.find((e) => e.label.includes('enterprise'))?.tick ?? 1,
    run: async (s) => {
      await s.snapshot()
      await s.wait()
      await s.update(3, 'enterprise')
      await s.wait()
      await s.update(3, 'free')
      await s.wait()
      await s.snapshot()
    },
  },
  {
    id: 'dashboard-at-t',
    title: 'What did the dashboard show at T?',
    setup: 'Snapshot regularly while plans change, then full-reload.',
    lookFor:
      'The full-reload table only knows today, so “how many pro customers did we have at tick 4?” has no answer there. The SCD2 table answers it with valid_from ≤ T < valid_to. Drag the slider.',
    asOf: () => 4,
    run: async (s) => {
      await s.snapshot()
      await s.update(1, 'pro')
      await s.update(3, 'pro')
      await s.snapshot()
      await s.update(2, 'enterprise')
      await s.remove(5)
      await s.snapshot()
      await s.update(1, 'enterprise')
      await s.snapshot()
      await s.fullReload()
    },
  },
]
