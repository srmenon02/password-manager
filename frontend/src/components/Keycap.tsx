import type { PropsWithChildren } from 'react'

export default function Keycap({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <kbd
      className={`border border-outline-variant px-1.5 py-0.5 font-label-caps text-label-caps uppercase text-on-surface-variant ${className}`}
    >
      {children}
    </kbd>
  )
}
