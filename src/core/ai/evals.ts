import { normalCdf, normalQuantile } from '../abtest.ts'
import { normal, type Rng } from '../random.ts'

/**
 * Evaluating LLM outputs. Two prompts (A, B) answer the same eval items. Humans know which answers
 * are good; an LLM judge approximates them, with errors and biases. How big must the eval set be,
 * and can we trust the judge?
 */
export interface EvalParams {
  n: number
  /** True pass rates of the two prompts. */
  passA: number
  passB: number
  /** P(judge agrees with the human label) on a single answer. */
  judgeAccuracy: number
  /** Extra chance the judge prefers the longer answer (B is the more verbose prompt). */
  verbosityBias: number
  /** Extra chance the judge prefers whichever answer is shown first in a pairwise comparison. */
  positionBias: number
  /** Ask twice with the order swapped and average. */
  swap: boolean
}

export interface Item {
  /** Human ground truth: did each prompt pass? */
  a: boolean
  b: boolean
  /** Judge's single-answer verdicts. */
  judgeA: boolean
  judgeB: boolean
  /** Pairwise preference for B (0..1; 0.5 = tie or averaged disagreement). */
  prefersB: number
}

/** Items share difficulty: hard items fail for both prompts more often (realistic, and why pairing helps). */
export function simulateEval(p: EvalParams, rng: Rng): Item[] {
  const zA = normalQuantile(p.passA)
  const zB = normalQuantile(p.passB)
  return Array.from({ length: p.n }, () => {
    const difficulty = normal(rng)
    const a = 0.8 * difficulty + 0.6 * normal(rng) < zA
    const b = 0.8 * difficulty + 0.6 * normal(rng) < zB
    const judge = (truth: boolean, boost: number) => (rng() < Math.min(1, p.judgeAccuracy + (truth ? 0 : -boost)) ? truth : !truth)
    const judgeA = judge(a, 0)
    // verbosity: the judge is more lenient with the longer answer (B)
    const judgeB = rng() < p.verbosityBias ? true : judge(b, 0)
    // pairwise: base preference from the truth (better answer wins; ties are coin flips), then biases
    const truthPref = a === b ? 0.5 : b ? 1 : 0
    const pairwise = (bShownFirst: boolean) => {
      let pB = 0.5 + (truthPref - 0.5) * (2 * p.judgeAccuracy - 1)
      pB += p.verbosityBias * 0.5
      pB += bShownFirst ? p.positionBias : -p.positionBias
      return rng() < Math.max(0, Math.min(1, pB)) ? 1 : 0
    }
    const prefersB = p.swap ? (pairwise(true) + pairwise(false)) / 2 : pairwise(false) // unswapped: A always shown first
    return { a, b, judgeA, judgeB, prefersB }
  })
}

/** Wilson score interval for a proportion. */
export function wilson(successes: number, n: number, level = 0.95): [number, number] {
  if (n === 0) return [0, 1]
  const z = normalQuantile(1 - (1 - level) / 2)
  const ph = successes / n
  const den = 1 + (z * z) / n
  const centre = (ph + (z * z) / (2 * n)) / den
  const half = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / den
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

/**
 * Paired comparison of two prompts on the same items (McNemar-style z on discordant pairs):
 * only items where exactly one prompt passed carry information about the difference.
 */
export function pairedTest(items: readonly { a: boolean; b: boolean }[]) {
  const onlyB = items.filter((i) => i.b && !i.a).length
  const onlyA = items.filter((i) => i.a && !i.b).length
  const n = items.length
  const diff = (onlyB - onlyA) / n
  const se = Math.sqrt(onlyA + onlyB) / n
  const z = se === 0 ? 0 : diff / se
  return { diff, se, z, p: 2 * (1 - normalCdf(Math.abs(z))), discordant: onlyA + onlyB }
}

/** Unpaired two-proportion SE, for comparison (ignores that both prompts saw the same items). */
export function unpairedSe(items: readonly { a: boolean; b: boolean }[]) {
  const n = items.length
  const pa = items.filter((i) => i.a).length / n
  const pb = items.filter((i) => i.b).length / n
  return Math.sqrt((pa * (1 - pa)) / n + (pb * (1 - pb)) / n)
}

/** Cohen's kappa: agreement between two raters beyond what chance alone would give. */
export function kappa(x: readonly boolean[], y: readonly boolean[]): number {
  const n = x.length
  const agree = x.filter((v, i) => v === y[i]).length / n
  const px = x.filter(Boolean).length / n
  const py = y.filter(Boolean).length / n
  const chance = px * py + (1 - px) * (1 - py)
  return chance === 1 ? 1 : (agree - chance) / (1 - chance)
}
