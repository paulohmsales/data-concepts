import type { Rng } from '../random.ts'

/**
 * An agent completes a task by chaining tool calls. Each step succeeds with probability p. A failed
 * step is noticed (by checking the tool result, a validator, or the model re-reading it) with
 * probability `detect`, and then retried; an unnoticed failure silently corrupts the rest of the
 * task. The agent gives up when it runs out of its step budget.
 */
export interface AgentParams {
  /** Steps the task needs. */
  steps: number
  /** Per-step success probability. */
  p: number
  /** Chance a failed step is noticed and retried. */
  detect: number
  /** Maximum tool calls before giving up. */
  budget: number
}

export type Outcome = 'success' | 'silent failure' | 'out of budget'

export interface Run {
  outcome: Outcome
  calls: number
}

export function runAgent(a: AgentParams, rng: Rng): Run {
  let done = 0
  let calls = 0
  while (done < a.steps) {
    if (calls >= a.budget) return { outcome: 'out of budget', calls }
    calls++
    if (rng() < a.p) {
      done++
      continue
    }
    if (rng() < a.detect) continue // noticed: retry this step
    return { outcome: 'silent failure', calls } // carried on with a wrong intermediate result
  }
  return { outcome: 'success', calls }
}

export function simulateAgents(a: AgentParams, n: number, rng: Rng) {
  const runs = Array.from({ length: n }, () => runAgent(a, rng))
  const share = (o: Outcome) => runs.filter((r) => r.outcome === o).length / n
  const meanCalls = runs.reduce((s, r) => s + r.calls, 0) / n
  return { runs, success: share('success'), silent: share('silent failure'), budget: share('out of budget'), meanCalls }
}

/** Without error detection (and an ample budget), success needs every step right: pᵏ. */
export const noRecovery = (p: number, k: number) => p ** k

/**
 * With unlimited retries, each step ends either in success or in an unnoticed failure; per step,
 * P(success) = p / (p + (1 − p)(1 − detect)). Raised to k for the task.
 */
export const withRecovery = (p: number, detect: number, k: number) => (p / (p + (1 - p) * (1 - detect))) ** k
