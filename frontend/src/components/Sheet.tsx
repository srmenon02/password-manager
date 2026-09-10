import { type ReactNode, useEffect, useRef } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// Built on <dialog>: the browser supplies the focus trap, Esc handling, and inert
// background that a hand-rolled panel has to reimplement.
export default function Sheet({ open, onClose, title, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
      // React never emits the autofocus attribute, so showModal() lands on the close
      // button; put the caret in the first field the way a native form dialog would.
      dialog.querySelector<HTMLElement>('input, textarea, select')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose()
        }
      }}
    >
      <div className="sheet-panel w-full max-h-[92vh] mt-auto border-t-2 border-ink bg-paper flex flex-col md:mt-0 md:ml-auto md:h-full md:max-h-none md:w-[min(36rem,100%)] md:border-t-0 md:border-l-2">
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-6 py-4 md:px-8">
          <h2 className="font-headline-md text-headline-md text-ink tracking-tighter">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 shrink-0 inline-flex items-center justify-center border border-transparent text-on-surface-variant hover:border-ink hover:text-ink transition-colors"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">{children}</div>
      </div>
    </dialog>
  )
}
