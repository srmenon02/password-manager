import { createContext, useContext, type PropsWithChildren } from 'react'
import Toasts from '@/components/Toasts'
import { useToasts } from '@/hooks/useToasts'

const ToastContext = createContext<((message: string) => void) | undefined>(undefined)

export function ToastProvider({ children }: PropsWithChildren) {
  const { toasts, push, dismiss } = useToasts()

  return (
    <ToastContext.Provider value={push}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const push = useContext(ToastContext)
  if (!push) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return push
}
