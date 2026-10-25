import { Component } from 'react';

// Shows a message instead of a blank white page if any component crashes.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI crash:', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container"><div className="card">
        <h1>Something went wrong</h1>
        <p className="error">{String(this.state.error.message || this.state.error)}</p>
        <p className="muted">Your data is safe on this device. Reload to continue.</p>
        <button className="btn primary" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>Reload app</button>
      </div></div>
    );
  }
}
