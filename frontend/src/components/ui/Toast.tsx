import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastIntent = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  intent: ToastIntent
  message: string
  detail?: string
  action?: ToastAction
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Successes and notices get out of the way; errors stay until acknowledged —
 *  an error nobody read is worse than no error at all. */
const AUTO_DISMISS_MS: Record<ToastIntent, number | null> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: null,
}

const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const startTimer = useCallback(
    (id: number, intent: ToastIntent) => {
      const ms = AUTO_DISMISS_MS[intent]
      if (ms === null) return
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ms),
      )
    },
    [dismiss],
  )

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...toast, id }])
      startTimer(id, toast.intent)
    },
    [startTimer],
  )

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={startTimer} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

const INTENT_STYLE: Record<ToastIntent, { bar: string; icon: string; label: string }> = {
  success: { bar: 'bg-good', icon: 'text-good', label: 'Success' },
  error: { bar: 'bg-critical', icon: 'text-critical', label: 'Error' },
  warning: { bar: 'bg-warn', icon: 'text-warn', label: 'Warning' },
  info: { bar: 'bg-accent', icon: 'text-accent', label: 'Note' },
}

function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
  onPause: (id: number) => void
  onResume: (id: number, intent: ToastIntent) => void
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => {
        const style = INTENT_STYLE[toast.intent]
        return (
          <div
            key={toast.id}
            role={toast.intent === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => onPause(toast.id)}
            onMouseLeave={() => onResume(toast.id, toast.intent)}
            className="animate-slide-in pointer-events-auto flex gap-3 overflow-hidden rounded-md border border-line bg-raised shadow-[var(--shadow-overlay)]"
          >
            <span aria-hidden className={`w-1 shrink-0 ${style.bar}`} />
            <div className="flex min-w-0 flex-1 gap-2.5 py-3 pr-2">
              <ToastIcon intent={toast.intent} className={`mt-0.5 shrink-0 ${style.icon}`} />
              <div className="min-w-0 flex-1">
                {/* The intent word, not just the colour — meaning is never colour-alone. */}
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{style.label}</p>
                <p className="mt-0.5 text-sm leading-snug text-ink">{toast.message}</p>
                {toast.detail && <p className="mt-1 text-xs leading-snug text-ink-3">{toast.detail}</p>}
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick()
                      onDismiss(toast.id)
                    }}
                    className="mt-2 text-xs font-medium text-accent hover:underline"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 px-3 text-ink-3 transition-colors hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ToastIcon({ intent, className }: { intent: ToastIntent; className?: string }) {
  const paths: Record<ToastIntent, ReactNode> = {
    success: <path d="M4 8.5l2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
    error: <path d="M8 4.5v4.2M8 11.3v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
    warning: <path d="M8 5v4M8 11.4v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
    info: <path d="M8 7.4v4.2M8 4.6v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      {intent !== 'success' && <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />}
      {paths[intent]}
    </svg>
  )
}
