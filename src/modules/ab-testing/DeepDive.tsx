import { Callout, Formula, Related, Steps, Worked } from '../../components/content.tsx'
import { requiredN, twoProportionZTest } from '../../core/abtest.ts'
import { int } from '../../format.ts'

const ex = twoProportionZTest(200, 1000, 250, 1000)
const pp = (x: number) => `${(x * 100).toFixed(2)} pp`

export default function DeepDive() {
  return (
    <>
      <h3>What an A/B test actually estimates</h3>
      <p>
        The quantity you want is the <b>average treatment effect</b>: how much the conversion rate would
        change if <em>everyone</em> got B instead of A. You can never see the same user both ways, so you
        randomise: a coin decides who sees which version. Randomisation makes the two groups alike in
        everything (device, mood, intent, seasonality) except the change, <em>on average</em>. So the
        difference in their rates is an unbiased estimate of the effect. The only thing left to argue about is
        chance, and that is what the statistics handle.
      </p>

      <h3>The test, step by step</h3>
      <Steps
        items={[
          {
            title: 'Observed rates',
            body: (
              <>
                p̂<sub>A</sub> = conversions<sub>A</sub> / n<sub>A</sub>, p̂<sub>B</sub> likewise; the estimate is the
                difference d̂ = p̂<sub>B</sub> − p̂<sub>A</sub>.
              </>
            ),
          },
          {
            title: 'How much would d̂ wobble if there were no effect?',
            body: (
              <>
                Under H₀ both arms share one rate, best estimated by pooling: p̄ = (x<sub>A</sub> + x<sub>B</sub>) /
                (n<sub>A</sub> + n<sub>B</sub>). Each rate is an average of 0/1 draws, so its variance is p(1 − p)/n,
                and variances of independent estimates add.
                <Formula>SE₀ = √( p̄(1 − p̄) · (1/n_A + 1/n_B) )</Formula>
              </>
            ),
          },
          {
            title: 'Standardise',
            body: (
              <>
                z = d̂ / SE₀: how many “typical wobbles” the observed gap is. By the central limit theorem z is close
                to standard normal under H₀ (when each arm has at least a few dozen conversions).
              </>
            ),
          },
          {
            title: 'p-value',
            body: (
              <>
                p = 2·(1 − Φ(|z|)): the probability, if there were no effect, of a gap at least this large in either
                direction. Reject H₀ when p &lt; α.
              </>
            ),
          },
          {
            title: 'Confidence interval for the effect',
            body: (
              <>
                The interval describes the actual difference, so it uses each arm’s own variance (unpooled):
                <Formula>d̂ ± z₁₋α/₂ · √( p̂_A(1 − p̂_A)/n_A + p̂_B(1 − p̂_B)/n_B )</Formula>
                That’s why, near the boundary, the test and the interval can very occasionally disagree.
              </>
            ),
          },
        ]}
      />
      <Worked title="200 of 1,000 vs 250 of 1,000">
        <p>
          p̂<sub>A</sub> = 20%, p̂<sub>B</sub> = 25%, d̂ = 5 pp. Pooled p̄ = 450/2000 = 22.5%, so SE₀ =
          √(0.225 · 0.775 · 2/1000) = {ex.se.toFixed(4)}. z = 0.05 / {ex.se.toFixed(4)} = {ex.z.toFixed(2)}, p ={' '}
          {ex.pValue.toFixed(4)}. 95% interval: {pp(ex.ci[0])} to {pp(ex.ci[1])}. Significant, and the effect
          could plausibly be anything from about 1.3 to 8.7 points: the interval is more informative than the
          p-value.
        </p>
      </Worked>

      <h3>Power, minimum detectable effect and sample size</h3>
      <p>
        Two bell curves: d̂ under “no effect” (centred on 0) and under the true effect (centred on d). The
        test rejects when d̂ falls beyond z₁₋α/₂·SE₀. <b>Power</b> is the share of the second bell beyond that
        line. It grows with the effect, with n (both bells narrow like 1/√n) and with α.
      </p>
      <Formula caption="Users per arm for power 1 − β (two-sided). With α = 0.05 and 80% power the numerator is about (1.96 + 0.84)².">
        n ≈ ( z₁₋α/₂·√(2p̄(1 − p̄)) + z₁₋β·√(p_A(1 − p_A) + p_B(1 − p_B)) )² / d²
      </Formula>
      <p>
        A good back-of-the-envelope version is <b>n ≈ 16·p(1 − p)/d² per arm</b> (α = 0.05, 80% power). The d² in
        the denominator is the whole story: halve the effect you want to detect and you need four times the
        users.
      </p>
      <Worked title="10% baseline, 5% relative lift">
        <p>
          d = 0.10 × 0.05 = 0.005. n ≈ 16 × 0.09 / 0.005² = 57,600 per arm; the exact formula gives{' '}
          {int(requiredN({ baseline: 0.1, lift: 0.05, alpha: 0.05 }))}. At 5,000 users a day split two ways, that’s
          about 23 days. Detecting a 2% relative lift instead needs ≈ {int(requiredN({ baseline: 0.1, lift: 0.02, alpha: 0.05 }))} per arm.
        </p>
      </Worked>
      <Callout kind="note" title="Minimum detectable effect">
        Turn the formula around: given the traffic you have, the smallest effect you can reliably detect is
        MDE ≈ 2.8 · √(2p(1 − p)/n). If the MDE is bigger than any effect the change could plausibly have, don’t run
        the test as designed: test a bolder change, use a more sensitive metric, or reduce variance (CUPED).
      </Callout>

      <h3>Why peeking breaks the 5%</h3>
      <p>
        The 5% guarantee is for <em>one</em> look at a sample size fixed in advance. The running z-statistic is a
        random walk: early on it swings widely, and each look is another chance to catch it beyond the line.
        With 5 looks the false-positive rate is about 14%; with 20, about 25%; if you could look continuously
        forever it would reach 100% (the law of the iterated logarithm guarantees the walk eventually crosses
        any fixed line).
      </p>
      <p>Fixes, in increasing sophistication:</p>
      <ul>
        <li>
          <b>Fixed horizon:</b> compute n up front, look only at the end. Dashboards can show data, but nobody decides
          before the end.
        </li>
        <li>
          <b>Group sequential designs:</b> plan K interim looks and spend α across them, with stricter thresholds
          early (O’Brien–Fleming: |z| &gt; 4.05, 2.86, 2.34, 2.02 for four looks) so the overall error stays 5%.
        </li>
        <li>
          <b>Always-valid inference</b> (mixture SPRT, confidence sequences): p-values you may check any time, at the
          cost of wider intervals. This is what most commercial experimentation platforms use.
        </li>
        <li>
          <b>Bayesian analysis</b> is not a free pass: “stop when P(B &gt; A) &gt; 95%” checked daily has inflated
          error rates too, unless the decision rule is designed for it.
        </li>
      </ul>

      <h3>The winner’s curse (type M errors)</h3>
      <p>
        Estimates scatter around the truth with spread SE. Significance keeps only those beyond ≈ 2·SE. When the
        true effect is small relative to SE (low power), the survivors are the lucky overshoots, so the
        average significant estimate exaggerates the effect. At 30% power the exaggeration is typically about
        1.8×; at 10% power, more than 3×. A sign error (a “significant” result in the wrong direction) also
        becomes possible. Gelman calls these type M and type S errors.
      </p>
      <Callout kind="prod">
        Launch decisions are often fine (the sign is right), but the <em>forecast</em> built on the measured
        lift is not. Discount wins from underpowered tests, replicate important ones, or use shrinkage (an
        empirical-Bayes prior from your past experiments).
      </Callout>

      <h3>What goes wrong in real experiments</h3>
      <ul>
        <li>
          <b>Unit mismatch:</b> randomise by user but analyse per session or pageview, and observations are no
          longer independent. The naive SE is too small, so false positives go up. Use the delta method or
          cluster-robust errors for ratio metrics.
        </li>
        <li>
          <b>Sample ratio mismatch:</b> if arm sizes are off, something removed users non-randomly. Check before
          reading any metric (see the SRM module).
        </li>
        <li>
          <b>Novelty and primacy:</b> users react to change itself. Look at effects by days-since-exposure; run
          long enough to cover a full weekly cycle.
        </li>
        <li>
          <b>Many metrics and segments:</b> name one primary metric up front; everything else is exploratory or
          corrected (see Multiple comparisons).
        </li>
        <li>
          <b>Interference:</b> in marketplaces and social products, treated users affect control users (shared
          drivers, shared inventory). User-level randomisation is then biased; use cluster or switchback designs.
        </li>
        <li>
          <b>Practical vs statistical significance:</b> with millions of users, tiny effects are significant. Decide
          the smallest effect worth shipping before you look.
        </li>
      </ul>
      <Related slugs={['sample-ratio-mismatch', 'multiple-comparisons', 'cuped', 'confidence-intervals', 'clt']} />
    </>
  )
}
