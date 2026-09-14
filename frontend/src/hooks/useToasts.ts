import { useCallback, useEffect, useRef, useState } from 'react'

export type Toast = { id: number; message: string }

const MAX_VISIBLE = 3

export function appendToast(current: Toast[], toast: Toast) {
  return [...current, toast].slice(-MAX_VISIBLE)
}

export function removeToast(current: Toast[], id: number) {
  return current.filter((toast) => toast.id !== id)
}

export function useToasts(timeout = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => removeToast(current, id))
  }, [])

  const push = useCallback(
    (message: string) => {
      const id = nextId.current
      nextId.current += 1
      setToasts((current) => appendToast(current, { id, message }))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), timeout)
      )
      return id
    },
    [dismiss, timeout]
  )

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      timers.current.clear()
    },
    []
  )

  return { toasts, push, dismiss }
}
