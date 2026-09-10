import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'
import { VAULT_NAV } from '@/components/navItems'
import {
  headerAction,
  heroAction,
  heroLabel,
  inlineIconAction,
} from '@/components/controlStyles'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?'

function pickRandom(charset: string) {
  return charset[Math.floor(Math.random() * charset.length)]
}

function shuffle(input: string) {
  const chars = input.split('')
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = chars[i]
    chars[i] = chars[j]
    chars[j] = temp
  }
  return chars.join('')
}

function generatePassword(length: number, useUpper: boolean, useLower: boolean, useNumbers: boolean, useSymbols: boolean) {
  const selected: string[] = []
  if (useUpper) {
    selected.push(UPPER)
  }
  if (useLower) {
    selected.push(LOWER)
  }
  if (useNumbers) {
    selected.push(NUMBERS)
  }
  if (useSymbols) {
    selected.push(SYMBOLS)
  }
  if (selected.length === 0) {
    return ''
  }

  let result = selected.map((set) => pickRandom(set)).join('')
  const merged = selected.join('')
  while (result.length < length) {
    result += pickRandom(merged)
  }
  return shuffle(result.slice(0, length))
}

export default function GeneratorPage() {
  usePageMeta('Password Generator · cipher', 'Generate strong, random passwords instantly.')
  const navigate = useNavigate()
  const { clearVaultSession } = useVault()
  const isLoggedIn = Boolean(localStorage.getItem('cipher_token'))
  const [length, setLength] = useState(16)
  const [useUpper, setUseUpper] = useState(true)
  const [useLower, setUseLower] = useState(true)
  const [useNumbers, setUseNumbers] = useState(true)
  const [useSymbols, setUseSymbols] = useState(true)
  const [seed, setSeed] = useState(0)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  const password = useMemo(
    () => generatePassword(length, useUpper, useLower, useNumbers, useSymbols),
    // `seed` is not read inside the callback but is required: generatePassword is
    // non-deterministic, so bumping it is what forces a fresh password on Regenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [length, useUpper, useLower, useNumbers, useSymbols, seed]
  )

  function regenerate() {
    setSeed((s) => s + 1)
    setCopyStatus('idle')
  }

  async function copyPassword() {
    if (!password) {
      return
    }

    try {
      await navigator.clipboard.writeText(password)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }

    setTimeout(() => setCopyStatus('idle'), 2000)
  }

  return (
    <div className="bg-paper text-on-surface font-body-md min-h-screen flex flex-col selection:bg-mint selection:text-ink">
      <AppHeader
        nav={isLoggedIn ? VAULT_NAV : [{ label: 'Login', to: '/login' }]}
        navLabel={isLoggedIn ? 'Vault sections' : 'Main'}
        action={
          isLoggedIn ? (
            <button
              type="button"
              onClick={handleLogout}
              className={headerAction}
            >
              Log Out
            </button>
          ) : undefined
        }
      />

      <main className="flex-grow flex flex-col md:flex-row px-margin-safe py-12 md:py-24 gap-12 md:gap-24 relative overflow-hidden">
        <div className="w-full md:w-1/2 flex flex-col z-10 md:mt-hero-offset">
          <h1 className="font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink mb-6">Create something unguessable.</h1>
          <div className="bg-mint border-2 border-ink p-8 relative group hover:bg-sage transition-colors duration-500 ease-in-out cursor-pointer shadow-[8px_8px_0px_0px_rgba(25,9,34,1)]">
            <div className="flex justify-between items-start mb-16">
              <button aria-label="Copy password" className={inlineIconAction} onClick={copyPassword}>
                <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>
              </button>
              <span role="status" aria-live="polite" className="font-label-caps text-label-caps uppercase text-ink">
                {copyStatus === 'copied' && 'Copied'}
                {copyStatus === 'error' && 'Copy failed'}
              </span>
            </div>
            <div className="font-headline-md text-headline-md text-ink break-all tracking-widest font-bold" id="password-display">
              {password || 'Select at least one rule'}
            </div>
          </div>
        </div>

        <div className="w-full md:w-1/2 flex flex-col z-10">
          <div className="bg-taupe border-2 border-ink p-8 shadow-[8px_8px_0px_0px_rgba(25,9,34,1)]">
            <div className="mb-12">
              <div className="flex justify-between items-center mb-4">
                <label className="font-label-caps text-label-caps text-ink font-bold" htmlFor="length">LENGTH</label>
                <span className="font-body-lg text-body-lg text-ink font-bold" id="length-val">{length}</span>
              </div>
              <input
                className="w-full h-2 bg-ink appearance-none custom-slider rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                id="length"
                max={64}
                min={8}
                type="range"
                value={length}
                onChange={(event) => {
                  setLength(Number(event.target.value))
                }}
              />
            </div>
            <div className="space-y-6">
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Uppercase</span>
                <input checked={useUpper} className="w-8 h-8 accent-primary cursor-pointer" type="checkbox" onChange={(event) => setUseUpper(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Lowercase</span>
                <input checked={useLower} className="w-8 h-8 accent-primary cursor-pointer" type="checkbox" onChange={(event) => setUseLower(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Numbers</span>
                <input checked={useNumbers} className="w-8 h-8 accent-primary cursor-pointer" type="checkbox" onChange={(event) => setUseNumbers(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Symbols</span>
                <input checked={useSymbols} className="w-8 h-8 accent-primary cursor-pointer" type="checkbox" onChange={(event) => setUseSymbols(event.target.checked)} />
              </label>
            </div>
            <button type="button" onClick={regenerate} className={`${heroAction} mt-12 w-full`}>
              <span className={heroLabel}>Regenerate</span>
            </button>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-2/3 h-full -z-10 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, #FFB7C3 0%, transparent 60%)' }}></div>
      </main>
    </div>
  )
}
