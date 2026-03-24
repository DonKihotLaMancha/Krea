import React from 'react';

/**
 * Catches render errors so a blank #root is replaced with a readable message.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Krea]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            minHeight: '100dvh',
            padding: '1.5rem',
            fontFamily: 'system-ui, Segoe UI, sans-serif',
            background: '#fef2f2',
            color: '#991b1b',
            maxWidth: '42rem',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>The app couldn&apos;t start</h1>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: '0.875rem',
              background: '#fff',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              color: '#0f172a',
            }}
          >
            {msg}
          </pre>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            Open DevTools (F12) → Console for the full stack trace. Try a hard refresh (Ctrl+Shift+R) or disable extensions.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
