import ModuleLayout from '../../components/ModuleLayout.tsx'

const todo = <p style={{ color: 'var(--muted)' }}>Coming in M3.</p>

export default function AbTesting() {
  return (
    <ModuleLayout
      title="A/B testing"
      intuition={todo}
      play={todo}
      breakIt={todo}
      explainBack={todo}
    />
  )
}
