// Shared control styling for the vault surfaces. Row-level actions stay borderless until
// hover or focus so a list of credentials reads as ruled text, not as a grid of buttons.
export const quietAction =
  'min-h-11 px-3 inline-flex items-center justify-center border border-transparent font-body-md text-body-md text-on-surface-variant transition-colors hover:border-ink hover:text-ink focus-visible:border-ink'

export const quietDestructiveAction = `${quietAction} hover:border-error hover:bg-error hover:text-on-error`

export const quietIconAction =
  'w-11 h-11 border border-transparent inline-flex items-center justify-center text-on-surface-variant transition-colors hover:border-ink hover:bg-mint hover:text-ink focus-visible:border-ink'

export const outlinedAction =
  'vault-btn-secondary min-h-11 px-4 inline-flex items-center justify-center font-body-md text-body-md'

export const primaryAction =
  'vault-btn-primary min-h-11 px-5 inline-flex items-center justify-center font-body-md text-body-md font-bold disabled:opacity-60 disabled:cursor-not-allowed'

export const fieldLabel =
  'block font-label-caps text-label-caps uppercase text-on-surface-variant mb-2'

export const fieldInput =
  'input-line w-full px-1 py-2 font-body-md text-body-md text-ink placeholder:text-on-surface-variant'
