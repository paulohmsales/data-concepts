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
  'snapshots.watermark': lazy(() => import('./snapshots/WatermarkTimeline.tsx')),
}
