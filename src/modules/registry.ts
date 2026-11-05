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
    slug: 'multiple-comparisons',
    title: 'Multiple comparisons',
    category: 'Experimentation',
    summary: 'test 20 things and something wins: Bonferroni, Holm and false discovery rates.',
    Component: lazy(() => import('./multiple-comparisons/MultipleComparisons.tsx')),
  },
  {
    slug: 'sample-ratio-mismatch',
    title: 'Sample ratio mismatch',
    category: 'Experimentation',
    summary: 'when arm sizes are off, the result is broken: the chi-square check and the leaky variant.',
    Component: lazy(() => import('./srm/Srm.tsx')),
  },
  {
    slug: 'cuped',
    title: 'CUPED',
    category: 'Experimentation',
    summary: 'pre-period data as free traffic, and the covariate that eats your effect.',
    Component: lazy(() => import('./cuped/Cuped.tsx')),
  },
  {
    slug: 'join-fanout',
    title: 'Grain and join fan-out',
    category: 'Analytics engineering',
    summary: 'why revenue doubles after a join, the SUM(DISTINCT) trap and the LEFT JOIN that isn’t.',
    Component: lazy(() => import('./join-fanout/JoinFanout.tsx')),
  },
  {
    slug: 'window-functions',
    title: 'Window functions',
    category: 'Analytics engineering',
    summary: 'partitions, peers and frames row by row; the default-frame and tie traps.',
    Component: lazy(() => import('./window-functions/WindowFunctions.tsx')),
  },
  {
    slug: 'surrogate-keys',
    title: 'Surrogate keys',
    category: 'Analytics engineering',
    summary: 'row_number keys that reassign your facts, and hash keys that collide on NULLs and concat.',
    Component: lazy(() => import('./surrogate-keys/SurrogateKeys.tsx')),
  },
  {
    slug: 'snapshots',
    title: 'Snapshots and incremental loads',
    category: 'Data engineering',
    summary: 'full reloads, watermarks, SCD2 history, hard deletes, late data and idempotent retries.',
    Component: lazy(() => import('./snapshots/Snapshots.tsx')),
  },
  {
    slug: 'retries-idempotency',
    title: 'Retries and idempotency',
    category: 'Data engineering',
    summary: 'lost acks, at-least-once delivery, double charges and the idempotency key that fixes them.',
    Component: lazy(() => import('./retries/Retries.tsx')),
  },
  {
    slug: 'late-data',
    title: 'Late data and watermarks',
    category: 'Data engineering',
    summary: 'event time vs processing time, allowed lateness, dropped stragglers and the outage spike.',
    Component: lazy(() => import('./late-data/LateData.tsx')),
  },
  {
    slug: 'partitioning',
    title: 'Partitioning',
    category: 'Data engineering',
    summary: 'pruning, the function that disables it, small files and the hot key that stalls a job.',
    Component: lazy(() => import('./partitioning/Partitioning.tsx')),
  },
  {
    slug: 'cohorts',
    title: 'Cohorts and retention',
    category: 'Data analysis',
    summary: 'the retention triangle, active users that grow while retention falls, and the denominator trap.',
    Component: lazy(() => import('./cohorts/Cohorts.tsx')),
  },
  {
    slug: 'funnels',
    title: 'Funnels',
    category: 'Data analysis',
    summary: 'order, windows and denominators: why two funnel dashboards disagree, and the 115% step.',
    Component: lazy(() => import('./funnels/Funnels.tsx')),
  },
  {
    slug: 'trend-seasonality',
    title: 'Trend vs seasonality',
    category: 'Data analysis',
    summary: 'moving averages, YoY vs MoM, and comparing Monday with Sunday.',
    Component: lazy(() => import('./seasonality/Seasonality.tsx')),
  },
]
