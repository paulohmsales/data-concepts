import { lazy, type ComponentType } from 'react'

/** Props every visual receives: its block `props`, and for steppers the current step's `state`. */
export interface VisualProps {
  props: Record<string, unknown>
  state?: Record<string, unknown>
}

/**
 * Registered figures that content blocks reference by key (type: visual / stepper, key: ...).
 * Lazy, so a page only downloads the visuals it uses.
 */
export const visuals: Record<string, ComponentType<VisualProps>> = {
  'ab.twoBells': lazy(() => import('./ab/TwoBells.tsx')),
  'ab.peekWalk': lazy(() => import('./ab/PeekWalk.tsx')),
  'stats.ciDance': lazy(() => import('./stats/CiDance.tsx')),
  'stats.resample': lazy(() => import('./stats/ResampleAnim.tsx')),
  'stats.simpsonMosaic': lazy(() => import('./stats/SimpsonMosaic.tsx')),
  'stats.skillLuck': lazy(() => import('./stats/SkillLuck.tsx')),
  'stats.diceSum': lazy(() => import('./stats/DiceSum.tsx')),
  'snapshots.watermark': lazy(() => import('./snapshots/WatermarkTimeline.tsx')),
}
