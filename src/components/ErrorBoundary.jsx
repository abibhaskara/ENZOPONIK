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
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          color: '#fff',
          background: '#1a1a1a',
          minHeight: '100vh',
          fontFamily: 'monospace',
          overflow: 'auto',
          boxSizing: 'border-box'
        }}>
          <h1 style={{ color: '#ef4444', fontSize: '20px', marginBottom: '12px' }}>[ENZOPONIK] Render Crash Caught</h1>
          <p style={{ fontWeight: 'bold', color: '#f59e0b', marginBottom: '16px' }}>
            {this.state.error && this.state.error.toString()}
          </p>
          <pre style={{
            background: '#2d2d2d',
            padding: '16px',
            borderRadius: '8px',
            color: '#e5e7eb',
            whiteSpace: 'pre-wrap',
            fontSize: '12px',
            lineHeight: '1.4'
          }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.reload();
              }}
              style={{
                padding: '8px 16px',
                background: '#2ad1ab',
                border: 'none',
                borderRadius: '6px',
                color: '#121212',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                padding: '8px 16px',
                background: '#4b5563',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Reset app (Clear Storage)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
