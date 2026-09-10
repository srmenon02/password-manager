import type { Toast } from '@/hooks/useToasts'

type ToastsProps = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

// Rendered unconditionally: an aria-live region has to be in the DOM before the
// message lands in it, or screen readers announce nothing.
export default function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-stretch gap-2 md:left-auto md:right-6 md:bottom-6 md:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-in pointer-events-auto flex items-start gap-3 border-2 border-ink bg-mint px-4 py-3 font-body-md text-body-md text-ink shadow-[6px_6px_0px_0px_theme(colors.ink)] md:max-w-sm"
        >
          <span className="material-symbols-outlined shrink-0 text-[20px]" aria-hidden="true">
            check_circle
          </span>
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="-my-1 -mr-1 shrink-0 w-8 h-8 inline-flex items-center justify-center hover:opacity-70 transition-opacity"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}
