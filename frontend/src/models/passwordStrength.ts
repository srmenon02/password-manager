export type StrengthLabel = 'very weak' | 'weak' | 'fair' | 'strong' | 'excellent'

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4
  label: StrengthLabel
  bits: number
  /** Set when the bit estimate overstates the real strength, so callers can say why. */
  reason: 'common-pattern' | null
}

const CHARSETS: [RegExp, number][] = [
  [/[a-z]/, 26],
  [/[A-Z]/, 26],
  [/[0-9]/, 10],
  [/[^a-zA-Z0-9]/, 33],
]

// Structural strength only. Whether a password is already circulating in a breach is a
// separate, stronger signal that comes from the HIBP k-anonymity check, not from here.
const COMMON = [
  'password',
  'qwerty',
  '123456',
  'letmein',
  'admin',
  'welcome',
  'iloveyou',
  'dragon',
  'monkey',
  'abc123',
  'football',
  'sunshine',
]

function charsetSize(password: string) {
  return CHARSETS.reduce((total, [pattern, size]) => (pattern.test(password) ? total + size : total), 0)
}

// A repeated or sequential character carries far less than a fresh one, so it counts half.
// Without this, "abcdefgh" and "aaaaaaaa" score like eight independent picks.
function effectiveLength(password: string) {
  let length = 0
  for (let i = 0; i < password.length; i += 1) {
    const previous = password.charCodeAt(i - 1)
    const current = password.charCodeAt(i)
    const isRun = i > 0 && Math.abs(current - previous) <= 1
    length += isRun ? 0.5 : 1
  }
  return length
}

const LABELS: StrengthLabel[] = ['very weak', 'weak', 'fair', 'strong', 'excellent']

export function passwordStrength(password: string): Strength {
  if (!password) {
    return { score: 0, label: 'very weak', bits: 0, reason: null }
  }

  const size = charsetSize(password)
  const bits = Math.round(effectiveLength(password) * Math.log2(size || 1))
  const lowered = password.toLowerCase()
  const hasCommonPattern = COMMON.some((common) => lowered.includes(common))

  let score: Strength['score'] = 0
  if (bits >= 80) score = 4
  else if (bits >= 60) score = 3
  else if (bits >= 40) score = 2
  else if (bits >= 28) score = 1

  // A recognisable word or run anywhere in the password means the entropy estimate is
  // fiction: an attacker guesses the pattern, not the character space.
  if (hasCommonPattern && score > 1) {
    score = 1
  }

  return {
    score,
    label: LABELS[score],
    bits,
    reason: hasCommonPattern ? 'common-pattern' : null,
  }
}

export function countReusedPasswords(passwords: string[]) {
  const seen = new Map<string, number>()
  for (const password of passwords) {
    seen.set(password, (seen.get(password) ?? 0) + 1)
  }
  return [...seen.values()].filter((count) => count > 1).reduce((total, count) => total + count, 0)
}

export function reusedPasswordSet(passwords: string[]) {
  const seen = new Map<string, number>()
  for (const password of passwords) {
    seen.set(password, (seen.get(password) ?? 0) + 1)
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([password]) => password))
}
