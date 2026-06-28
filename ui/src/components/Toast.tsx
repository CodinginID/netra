import { createContext, useCallback, useContext, useRef, useState } from 'react'
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
  success: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  error:   'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
  info:    'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
}

const SHADOWS: Record<ToastType, string> = {
  success: '0 8px 32px rgba(5, 150, 105, 0.35)',
  error:   '0 8px 32px rgba(220, 38, 38, 0.35)',
  info:    '0 8px 32px rgba(37, 99, 235, 0.35)',
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
}

function ToastRow({ t, onDismiss }: { t: ToastItem; onDismiss: (id: number) => void }) {
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)

  return (
    <div
      key={t.id}
      role={t.type === 'error' ? 'alert' : undefined}
      aria-live={t.type === 'error' ? 'assertive' : undefined}
      className="toast-enter"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 22px',
        borderRadius: 14,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        background: COLORS[t.type],
        boxShadow: SHADOWS[t.type],
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.15)',
        cursor: 'pointer',
        pointerEvents: 'auto',
        transform: dx ? `translateX(${dx}px)` : undefined,
        opacity: dx ? Math.max(0, 1 - Math.abs(dx) / 160) : 1,
        transition: startX.current === null ? 'transform 0.2s, opacity 0.2s' : 'none',
        touchAction: 'pan-y',
      }}
      onClick={() => onDismiss(t.id)}
      onTouchStart={(e) => { startX.current = e.touches[0].clientX }}
      onTouchMove={(e) => {
        if (startX.current === null) return
        setDx(e.touches[0].clientX - startX.current)
      }}
      onTouchEnd={() => {
        if (Math.abs(dx) > 80) onDismiss(t.id)
        startX.current = null
        setDx(0)
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
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
            onClick={(e) => {
              e.stopPropagation()
              t.action!.onClick()
              onDismiss(t.id)
            }}
          >
            {t.action.label}
          </button>
        )}
      </span>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((msg: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg, type, action }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
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
        <ToastRow key={t.id} t={t} onDismiss={dismiss} />
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
