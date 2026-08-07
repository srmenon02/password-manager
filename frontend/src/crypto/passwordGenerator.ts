const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?'

export interface PasswordGeneratorOptions {
  length?: number
  includeLower?: boolean
  includeUpper?: boolean
  includeDigits?: boolean
  includeSymbols?: boolean
}

function randomIndex(max: number): number {
  const bytes = crypto.getRandomValues(new Uint32Array(1))
  return bytes[0] % max
}

function pickRandom(charset: string): string {
  return charset[randomIndex(charset.length)]
}

export function generateSecurePassword(
  options: PasswordGeneratorOptions = {}
): string {
  const {
    length = 24,
    includeLower = true,
    includeUpper = true,
    includeDigits = true,
    includeSymbols = true,
  } = options

  if (length < 12) {
    throw new Error('Password length must be at least 12')
  }

  const enabledCharsets: string[] = []
  if (includeLower) {
    enabledCharsets.push(LOWER)
  }
  if (includeUpper) {
    enabledCharsets.push(UPPER)
  }
  if (includeDigits) {
    enabledCharsets.push(DIGITS)
  }
  if (includeSymbols) {
    enabledCharsets.push(SYMBOLS)
  }

  if (enabledCharsets.length === 0) {
    throw new Error('At least one character set must be enabled')
  }

  if (length < enabledCharsets.length) {
    throw new Error('Password length is too short for selected character sets')
  }

  const allowedChars = enabledCharsets.join('')
  const result: string[] = []

  for (const charset of enabledCharsets) {
    result.push(pickRandom(charset))
  }

  while (result.length < length) {
    result.push(pickRandom(allowedChars))
  }

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1)
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }

  return result.join('')
}
