// Last line of defence: a render error anywhere shows a way back instead of a blank page.
import { Component, type ReactNode } from 'react'

export default class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('Grant Test Auto hit an error while drawing the page:', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ maxWidth: 560, margin: '15vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif', color: '#222' }}>
        <h1 style={{ fontSize: 22 }}>Something on this page went wrong.</h1>
        <p>Nothing was lost: every request, invoice and decision is saved on the server.</p>
        <p>
          <a href={location.pathname} onClick={() => this.setState({ error: null })}>Back to the start</a>
          {' · '}
          <a href="#" onClick={e => { e.preventDefault(); location.reload() }}>Reload this page</a>
        </p>
      </div>
    )
  }
}
