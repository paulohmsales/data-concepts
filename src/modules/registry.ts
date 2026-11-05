import type { ComponentType } from 'react'
import AbTesting from './ab-testing/AbTesting.tsx'

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
    Component: AbTesting,
  },
]
