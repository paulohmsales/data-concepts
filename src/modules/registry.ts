import { lazy, type ComponentType } from 'react'

export const CATEGORIES = [
  'Statistics',
  'Experimentation',
  'Analytics engineering',
  'Data engineering',
  'Data analysis',
  'Machine learning',
] as const

export type Category = (typeof CATEGORIES)[number]

export interface ModuleEntry {
  slug: string
  title: string
  category: Category
  summary: string
  Component: ComponentType
}

export const modules: ModuleEntry[] = [
  {
    slug: 'clt',
    title: 'Central limit theorem',
    category: 'Statistics',
    summary: 'why averages are bell-shaped, how fast that kicks in, and when it never does.',
    Component: lazy(() => import('./clt/Clt.tsx')),
  },
  {
    slug: 'confidence-intervals',
    title: 'Confidence intervals',
    category: 'Statistics',
    summary: '100 intervals, some miss: what “95%” promises, and when it breaks (small n, z vs t, skew).',
    Component: lazy(() => import('./confidence-intervals/ConfidenceIntervals.tsx')),
  },
  {
    slug: 'bootstrap',
    title: 'The bootstrap',
    category: 'Statistics',
    summary: 'uncertainty for any statistic by resampling, and the two ways it quietly fails.',
    Component: lazy(() => import('./bootstrap/Bootstrap.tsx')),
  },
  {
    slug: 'simpsons-paradox',
    title: 'Simpson’s paradox',
    category: 'Statistics',
    summary: 'a treatment that wins in every group and loses overall, and how to tell which answer is right.',
    Component: lazy(() => import('./simpsons/Simpsons.tsx')),
  },
  {
    slug: 'regression-to-the-mean',
    title: 'Regression to the mean',
    category: 'Statistics',
    summary: 'why extremes come back toward average, and the useless intervention that seems to work.',
    Component: lazy(() => import('./regression-to-mean/RegressionToMean.tsx')),
  },
  {
    slug: 'ab-testing',
    title: 'A/B testing',
    category: 'Experimentation',
    summary: 'p-values, power, sample size, peeking and the winner’s curse.',
    Component: lazy(() => import('./ab-testing/AbTesting.tsx')),
  },
  {
    slug: 'snapshots',
    title: 'Snapshots and incremental loads',
    category: 'Data engineering',
    summary: 'full reloads, watermarks, SCD2 history, hard deletes, late data and idempotent retries.',
    Component: lazy(() => import('./snapshots/Snapshots.tsx')),
  },
]
