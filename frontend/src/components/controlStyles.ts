// The product's button system. Every page composes from these tiers so the same intent
// always looks the same: one hero action per Persuade/auth surface, one flat primary per
// task, and row-level actions that stay borderless until hover or focus.

/** Animated ink face in a rotating conic ring. The loudest action a surface may hold — one. */
export const heroAction = 'btn-hero'
export const heroLabel = 'font-body-md text-body-md font-bold uppercase tracking-wider'

/** Flat mint, ink border: the primary action inside the app. */
export const primaryAction =
  'vault-btn-primary min-h-11 px-5 inline-flex items-center justify-center font-body-md text-body-md font-bold disabled:opacity-60 disabled:cursor-not-allowed'

/** Solid ink: a primary that is also the only way to commit pending work. */
export const solidAction =
  'min-h-11 px-5 inline-flex items-center justify-center border border-ink bg-ink text-paper font-body-md text-body-md font-bold transition-colors hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed'

/** Outlined: the secondary choice standing next to a primary. */
export const outlinedAction =
  'vault-btn-secondary min-h-11 px-4 inline-flex items-center justify-center font-body-md text-body-md disabled:opacity-60 disabled:cursor-not-allowed'

/** Solid error: confirming something irreversible. */
export const destructiveAction =
  'min-h-11 px-4 inline-flex items-center justify-center border border-error bg-error text-on-error font-body-md text-body-md font-bold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed'

/** Row actions: borders appear on hover or focus, so a list reads as ruled text. */
export const quietAction =
  'min-h-11 px-3 inline-flex items-center justify-center border border-transparent font-body-md text-body-md text-on-surface-variant transition-colors hover:border-ink hover:text-ink focus-visible:border-ink'

export const quietDestructiveAction = `${quietAction} hover:border-error hover:bg-error hover:text-on-error`

export const quietIconAction =
  'w-11 h-11 border border-transparent inline-flex items-center justify-center text-on-surface-variant transition-colors hover:border-ink hover:bg-mint hover:text-ink focus-visible:border-ink'

/** Header-level text action (Log Out), and the icon buttons that sit inside a field or alert. */
export const headerAction =
  'inline-flex items-center min-h-11 font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors duration-200'

export const inlineTextAction =
  'min-h-11 px-1 inline-flex items-center font-body-md text-body-md text-on-surface-variant transition-colors hover:text-ink focus-visible:text-ink'

export const inlineIconAction =
  'w-8 h-8 inline-flex items-center justify-center text-on-surface-variant transition-colors hover:text-primary'

export const fieldLabel =
  'block font-label-caps text-label-caps uppercase text-on-surface-variant mb-2'

export const fieldInput =
  'input-line w-full px-1 py-2 font-body-md text-body-md text-ink placeholder:text-on-surface-variant'
