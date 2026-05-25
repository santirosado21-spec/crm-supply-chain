import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

/**
 * Error boundary global. Sin esto, una excepción durante el render dejaba
 * toda la app en blanco sin ningún mensaje ni registro. Captura el error,
 * lo loguea y muestra una pantalla de recuperación.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] error de render no controlado:', error, info.componentStack)
  }

  private handleReload = () => { window.location.reload() }

  render() {
    if (!this.state.hasError) return this.props.children

    // Estilos inline — funcionan aunque la hoja de estilos no haya cargado.
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, background: '#f5f7fa',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16,
          border: '1px solid #e5e7eb', padding: 32, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e3a5f', margin: '0 0 8px' }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
            Ocurrió un error inesperado en la aplicación. Recarga la página para
            continuar. Si el problema persiste, contacta a soporte.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#1e3a5f', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Recargar página
          </button>
          {this.state.error?.message && (
            <p style={{
              fontSize: 11, color: '#9ca3af', marginTop: 16, wordBreak: 'break-word',
              fontFamily: 'monospace',
            }}>
              {this.state.error.message}
            </p>
          )}
        </div>
      </div>
    )
  }
}
