export const isApplePlatform =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export const paletteShortcutLabel = isApplePlatform ? '⌘K' : 'Ctrl K'
