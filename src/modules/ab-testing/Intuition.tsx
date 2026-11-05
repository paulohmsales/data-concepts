export default function Intuition() {
  return (
    <>
      <p>
        You change a button and want to know whether more people now sign up. You split visitors at
        random: half see the old version (A), half the new one (B). Even if the change does nothing,
        the two groups will not convert at exactly the same rate, just as two runs of 100 coin flips
        rarely give the same number of heads.
      </p>
      <p>
        So the real question is: <em>is the gap bigger than luck usually produces?</em> The{' '}
        <b>p-value</b> answers a narrow version of that. If the change truly did nothing, how often
        would luck alone give a gap at least this big? A small p-value means “luck rarely does this”.
        It does <em>not</em> mean “there is a 97% chance B is better”.
      </p>
      <p>
        You pick a cut-off, <b>α</b> (usually 5%), before you start. Below it, you call the result
        significant. That means that when there is no effect, you will still be fooled α of the time.
        <b> Power</b> is the other side: when there <em>is</em> an effect, how often do you catch it?
        Small effects on small samples are hard to catch, so most such tests come back empty. The few
        that do “win” tend to be the lucky overshoots.
      </p>
      <p>
        Two habits break the whole system: <b>peeking</b> (checking repeatedly and stopping at the
        first good-looking result) and <b>trusting underpowered winners</b>. The experiments above let you do both.
      </p>
    </>
  )
}
