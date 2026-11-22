import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ENZOPONIK] Render error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isDev = import.meta.env.DEV;

    return (
      <div style={{
        padding: '24px',
        color: '#111827',
        background: '#f7f8f9',
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <div style={{
          maxWidth: '420px',
          width: '100%',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '18px',
          padding: '24px',
        }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#4b5563', margin: '0 0 16px', lineHeight: 1.5 }}>
            ENZOPONIK encountered an unexpected error. Reload the page to continue.
          </p>
          {isDev && this.state.error && (
            <pre style={{
              background: '#111827',
              color: '#f3f4f6',
              padding: '12px',
              borderRadius: '10px',
              whiteSpace: 'pre-wrap',
              fontSize: '11px',
              lineHeight: 1.4,
              maxHeight: '220px',
              overflow: 'auto',
              margin: '0 0 16px',
            }}>
              {this.state.error.toString()}
              {this.state.errorInfo?.componentStack || ''}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: '#10b981',
                border: 'none',
                borderRadius: '9999px',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                padding: '10px 16px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '9999px',
                color: '#374151',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Cache
            </button>
          </div>
        </div>
      </div>
    );
  }
}
