import { requiredN } from '../../core/abtest.ts'
import { int } from '../../format.ts'
import ExplainBackList, { type Question } from '../../components/ExplainBack.tsx'

const pmN = requiredN({ baseline: 0.02, lift: 0.01, alpha: 0.05 }, 0.8)

const questions: Question[] = [
  {
    q: 'What exactly does a p-value of 0.03 mean, and what does it not mean?',
    a: 'If there were truly no difference, a gap at least this large would show up in about 3% of experiments by chance alone. It is not the probability that the null is true, not a 97% chance B is better, and it says nothing about how big or important the effect is.',
  },
  {
    q: 'Why does doubling n not halve the confidence interval?',
    a: 'The standard error shrinks with √n, not n. Doubling n divides the width by √2 ≈ 1.41, so it narrows by about 29%. To halve the interval you need 4× the users.',
  },
  {
    q: 'Why does peeking inflate false positives when each single look uses α = 0.05?',
    a: 'Each look is another chance to be fooled, and the running p-value wanders, so the chance it dips below 0.05 at least once across many looks is far above 5% (about 25% for 20 looks). Stopping at the first dip turns those temporary lows into reported wins. The 5% guarantee holds only for one look at a pre-planned n (or with sequential-testing corrections).',
  },
  {
    q: 'At 30% power, why do the significant results overstate the true lift?',
    a: 'Estimates scatter around the true lift. At low power the significance cut-off sits above the true effect, so only estimates that overshot by luck clear it. Filtering on significance keeps the overshoots, so their average is biased upward (the winner’s curse, or Type M error).',
  },
  {
    q: 'Your PM wants to detect a 1% relative lift on a 2% baseline. What do you tell them, and how did you get it?',
    a: `2% → 2.02% is a 0.02 percentage-point gap. At α = 0.05 and 80% power the formula needs about ${int(pmN)} users per arm (n ≈ (z₀.₉₇₅·√(2p̄q̄) + z₀.₈·√(pAqA + pBqB))² / d²). Unless they have that traffic, the honest answer is: aim for a bigger change, accept a larger minimum detectable effect, or use variance reduction such as CUPED.`,
  },
]

export default function ExplainBack() {
  return <ExplainBackList questions={questions} />
}
