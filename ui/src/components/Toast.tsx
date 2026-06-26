import { createContext, useCallback, useContext, useState } from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info'
interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; msg: string; type: ToastType; action?: ToastAction }
interface ToastCtx { show: (msg: string, type?: ToastType, action?: ToastAction) => void }

const Ctx = createContext<ToastCtx>({ show: () => {} })

export function useToast() {
  return useContext(Ctx)
}

const COLORS: Record<ToastType, string> = {
  success: '#059669',
  error:   '#dc2626',
  info:    '#2563eb',
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((msg: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg, type, action }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const portal = createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        pointerEvents: 'none',
        width: 'max-content',
        maxWidth: 'min(480px, 90vw)',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : undefined}
          aria-live={t.type === 'error' ? 'assertive' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            color: '#fff',
            background: COLORS[t.type],
            boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
            opacity: 1,
            animation: 'toastIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {ICONS[t.type]}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {t.msg}
            {t.action && (
              <button
                className="toast-action-btn"
                onClick={() => {
                  t.action!.onClick()
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>,
    document.body
  )

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {portal}
    </Ctx.Provider>
  )
}
