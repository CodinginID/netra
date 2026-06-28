import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { t } from '@/store/i18nStore'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          minHeight: '60vh',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--color-danger)', fontSize: 20, fontWeight: 700 }}>
          {t('error.something_wrong')}
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text)', maxWidth: 480 }}>{error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--color-brand)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('error.reload_page')}
        </button>
      </div>
    )
  }
}

export function withErrorBoundary<P extends object>(
  Wrapped: ComponentType<P>,
  fallback?: ReactNode,
): ComponentType<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Wrapped {...props} />
      </ErrorBoundary>
    )
  }
}
