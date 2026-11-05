/**
 * Simpson's paradox: a comparison that holds inside every group reverses when the groups are pooled,
 * because the groups are mixed in different proportions.
 *
 * Two treatments (A, B), two strata (easy, hard). The pooled rate is a weighted average of the strata
 * rates, weighted by each treatment's own mix: overall = (1 − h)·easy + h·hard.
 */
export type Arm = 'A' | 'B'
export type Stratum = 'easy' | 'hard'

export interface Cell {
  n: number
  successes: number
}

export type Table = Record<Arm, Record<Stratum, Cell>>

/** Charig et al. (1986), kidney stones: A = open surgery, B = percutaneous nephrolithotomy. */
export const KIDNEY_STONES: Table = {
  A: { easy: { n: 87, successes: 81 }, hard: { n: 263, successes: 192 } },
  B: { easy: { n: 270, successes: 234 }, hard: { n: 80, successes: 55 } },
}

export const rate = (c: Cell) => c.successes / c.n

export function summarize(t: Table) {
  const arm = (a: Arm) => {
    const { easy, hard } = t[a]
    const n = easy.n + hard.n
    return {
      easy: rate(easy),
      hard: rate(hard),
      overall: (easy.successes + hard.successes) / n,
      hardShare: hard.n / n,
      n,
    }
  }
  const A = arm('A')
  const B = arm('B')
  // Standardised: both arms evaluated on the same mix (everyone, pooled across arms).
  const pooledHard = (t.A.hard.n + t.B.hard.n) / (A.n + B.n)
  const adjusted = (r: { easy: number; hard: number }) => (1 - pooledHard) * r.easy + pooledHard * r.hard
  return { A, B, pooledHard, adjustedA: adjusted(A), adjustedB: adjusted(B) }
}

/** True when A wins in every stratum but loses pooled (or the reverse). */
export function reverses(t: Table): boolean {
  const s = summarize(t)
  const winsEasy = Math.sign(s.A.easy - s.B.easy)
  const winsHard = Math.sign(s.A.hard - s.B.hard)
  const winsOverall = Math.sign(s.A.overall - s.B.overall)
  return winsEasy === winsHard && winsEasy !== 0 && winsOverall === -winsEasy
}

/** Build a table from rates and mixes (for the sliders); counts are rounded. */
export function tableFrom(
  rates: Record<Arm, Record<Stratum, number>>,
  hardShare: Record<Arm, number>,
  nPerArm: number,
): Table {
  const cell = (a: Arm, s: Stratum): Cell => {
    const n = Math.round(nPerArm * (s === 'hard' ? hardShare[a] : 1 - hardShare[a]))
    return { n, successes: Math.round(n * rates[a][s]) }
  }
  return {
    A: { easy: cell('A', 'easy'), hard: cell('A', 'hard') },
    B: { easy: cell('B', 'easy'), hard: cell('B', 'hard') },
  }
}
