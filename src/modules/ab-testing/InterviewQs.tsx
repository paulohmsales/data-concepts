import { Interview } from '../../components/content.tsx'
import { requiredN } from '../../core/abtest.ts'
import { int } from '../../format.ts'

const pmN = requiredN({ baseline: 0.02, lift: 0.01, alpha: 0.05 })

export default function InterviewQs() {
  return (
    <Interview
      items={[
        {
          level: 'junior',
          q: 'Explain a p-value of 0.03 to a product manager, without jargon.',
          answer: (
            <p>
              “If the new design truly made no difference, we’d see a gap this big or bigger in about 3 out of 100
              experiments, just from which users happened to land in each group. That’s rare enough that we
              believe the gap is real. It doesn’t tell us how big the effect is (that’s the interval), and it
              isn’t a 97% chance that B is better.”
            </p>
          ),
          listenFor: ['Conditional on no effect', '“At least this extreme”', 'Not P(hypothesis)', 'Points to the interval for size'],
          followUps: [{ q: 'And if p = 0.06?', a: 'Not enough evidence at our 5% bar; it’s not proof of no effect. Look at the interval and the power: an underpowered test can’t distinguish “nothing” from “small”.' }],
        },
        {
          level: 'mid',
          q: 'Design an A/B test for a new checkout button. Walk me through every decision.',
          answer: (
            <ul>
              <li><b>Hypothesis and primary metric:</b> checkout conversion per user who reaches the cart; guardrails: revenue per user, refund rate, latency.</li>
              <li><b>Unit:</b> randomise by user (logged-in id or a stable cookie), assignment at the moment the user sees the cart, so non-exposed users don’t dilute the effect.</li>
              <li><b>Size:</b> baseline 30%, smallest lift worth shipping 2% relative → d = 0.6 pp → n ≈ 16 · 0.21 / 0.006² ≈ 93k per arm; with 15k cart users a day that’s ~2 weeks; round up to whole weeks.</li>
              <li><b>Analysis plan, written before launch:</b> two-sided test at α = 0.05, fixed horizon (or a sequential method), SRM check first, no early stopping.</li>
              <li><b>Rollout:</b> 1% ramp for a day to catch bugs, then 50/50.</li>
            </ul>
          ),
          listenFor: ['One primary metric plus guardrails', 'Randomisation unit = analysis unit', 'Sample size from a pre-set MDE', 'Whole weeks', 'SRM and pre-registration'],
          followUps: [
            { q: 'Traffic only allows 3 weeks; your MDE needs 6. What now?', a: 'Detect a bigger effect (bolder change), use a more sensitive metric closer to the change, reduce variance with CUPED, use a one-sided test if only harm matters for the decision, or accept lower power explicitly.' },
          ],
        },
        {
          level: 'mid',
          q: 'The test is significant on day 3 of a planned 14. The PM wants to ship. What do you say?',
          answer: (
            <p>
              Not yet. The 5% error rate only holds at the planned end; checking along the way and stopping at the
              first significant reading inflates false positives several-fold, and early wins are usually
              exaggerated (winner’s curse). Day 3 also misses weekly patterns and novelty effects. If early stopping
              matters to the business, we should switch to a sequential design with proper boundaries for the next
              tests.
            </p>
          ),
          listenFor: ['Peeking inflates α', 'Early effects exaggerated', 'Weekly cycle and novelty', 'Offers a sequential alternative'],
        },
        {
          level: 'senior',
          q: 'Your PM wants to detect a 1% relative lift on a 2% conversion rate. What do you tell them?',
          answer: (
            <p>
              d = 0.02 pp, so n ≈ {int(pmN)} users per arm at 80% power. Unless we have that traffic (and that
              patience), the test can’t answer the question. Options: aim for a bigger effect; move the metric
              closer to the change (add-to-cart instead of purchase); variance reduction; or decide without a test
              if the change is cheap and low-risk.
            </p>
          ),
          listenFor: ['Computes the number', 'd² intuition', 'Offers alternatives rather than “no”'],
        },
        {
          level: 'senior',
          q: 'You randomise by user but report revenue per session. What goes wrong, and how do you fix it?',
          answer: (
            <p>
              Sessions from the same user are correlated, so treating sessions as independent understates the
              variance and the p-values come out too small. Also, if the treatment changes the number of sessions,
              the denominator itself is affected. Fix: analyse at the user level (revenue per user), or use the
              delta method / cluster-robust standard errors for the ratio metric, and report session counts as a
              separate metric.
            </p>
          ),
          listenFor: ['Unit of randomisation vs analysis', 'Correlated observations → SE too small', 'Delta method', 'Denominator affected by treatment'],
        },
        {
          level: 'staff',
          q: 'You’re asked to make experimentation trustworthy across the company. What do you build or enforce?',
          answer: (
            <ul>
              <li>A platform that assigns, logs exposure and computes results the same way every time (no hand analysis for launch decisions).</li>
              <li>Automatic checks: SRM, pre-period A/A balance, guardrail metrics, sample-size calculator with MDE.</li>
              <li>Sequential or always-valid statistics so dashboards can be watched safely.</li>
              <li>Pre-registration of hypothesis and primary metric; corrections for multiple metrics.</li>
              <li>Variance reduction by default (CUPED); a library of past effects to calibrate expectations and shrink estimates.</li>
              <li>Review culture: an experiment council or review for high-stakes tests, and a searchable archive of results.</li>
            </ul>
          ),
          listenFor: ['Automation over policy', 'SRM/guardrails built in', 'Peeking-safe stats', 'Institutional memory'],
        },
      ]}
    />
  )
}
