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
  'exp.metricLottery': lazy(() => import('./exp/MetricLottery.tsx')),
  'exp.bhSteps': lazy(() => import('./exp/BhSteps.tsx')),
  'exp.srmFlow': lazy(() => import('./exp/SrmFlow.tsx')),
  'exp.cupedSteps': lazy(() => import('./exp/CupedSteps.tsx')),
  'ae.fanoutJoin': lazy(() => import('./ae/FanoutJoin.tsx')),
  'ae.windowFrame': lazy(() => import('./ae/WindowFrame.tsx')),
  'ae.keyShift': lazy(() => import('./ae/KeyShift.tsx')),
  'de.ackLost': lazy(() => import('./de/AckLost.tsx')),
  'de.streamWindows': lazy(() => import('./de/StreamWindows.tsx')),
  'de.pruneCalendar': lazy(() => import('./de/PruneCalendar.tsx')),
  'da.cohortLayers': lazy(() => import('./da/CohortLayers.tsx')),
  'da.funnelPaths': lazy(() => import('./da/FunnelPaths.tsx')),
  'da.decompose': lazy(() => import('./da/Decompose.tsx')),
  'ml.dartboard': lazy(() => import('./ml/Dartboard.tsx')),
  'ml.cvFolds': lazy(() => import('./ml/CvFolds.tsx')),
  'ml.lrBall': lazy(() => import('./ml/LrBall.tsx')),
  'ml.iconArray': lazy(() => import('./ml/IconArray.tsx')),
  'ai.cosineAngle': lazy(() => import('./ai/CosineAngle.tsx')),
  'diagram.flow': lazy(() => import('./diagram/Flow.tsx')),
  'snapshots.watermark': lazy(() => import('./snapshots/WatermarkTimeline.tsx')),
}
