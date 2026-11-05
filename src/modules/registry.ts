import { lazy, type ComponentType } from 'react'

export interface ModuleEntry {
  slug: string
  title: string
  summary: string
  Component: ComponentType
}

export const modules: ModuleEntry[] = [
  {
    slug: 'ab-testing',
    title: 'A/B testing',
    summary: 'p-values, power, sample size, peeking and the winner’s curse.',
    Component: lazy(() => import('./ab-testing/AbTesting.tsx')),
  },
  {
    slug: 'snapshots',
    title: 'Snapshots and incremental loads',
    summary: 'full reloads, watermarks, SCD2 history, hard deletes, late data and idempotent retries.',
    Component: lazy(() => import('./snapshots/Snapshots.tsx')),
  },
]
