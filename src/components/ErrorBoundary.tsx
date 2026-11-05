import { Component, type ReactNode } from 'react'

/** Shows a readable message instead of a blank page when the API or a lab fails. */
/** Give it a `key` (e.g. the path) so navigating away clears the error. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ padding: '2rem 0' }}>
        <h2>Something went wrong</h2>
        <p className="lede">{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
