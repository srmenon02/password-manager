import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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
  const [length, setLength] = useState(16)
  const [useUpper, setUseUpper] = useState(true)
  const [useLower, setUseLower] = useState(true)
  const [useNumbers, setUseNumbers] = useState(true)
  const [useSymbols, setUseSymbols] = useState(true)
  const [seed, setSeed] = useState(0)

  const password = useMemo(
    () => generatePassword(length, useUpper, useLower, useNumbers, useSymbols),
    [length, useUpper, useLower, useNumbers, useSymbols, seed]
  )

  function regenerate() {
    setSeed((s) => s + 1)
  }

  async function copyPassword() {
    if (!password) {
      return
    }
    await navigator.clipboard.writeText(password)
  }

  return (
    <div className="bg-paper text-on-surface font-body-md min-h-screen flex flex-col selection:bg-mint selection:text-ink">
      <nav className="bg-paper w-full h-16 flex justify-between items-center px-gutter max-w-full">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">VaultKey</Link>
        <div className="hidden md:flex gap-8 items-center">
          <Link to="/vault" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Vault</Link>
          <span className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Generator</span>
        </div>
      </nav>

      <main className="flex-grow flex flex-col md:flex-row px-margin-safe py-12 md:py-24 gap-12 md:gap-24 relative overflow-hidden">
        <div className="w-full md:w-1/2 flex flex-col z-10 md:mt-hero-offset">
          <h1 className="font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink mb-6">Create something unguessable.</h1>
          <div className="bg-mint border-2 border-ink p-8 relative group hover:bg-sage transition-colors duration-500 ease-in-out cursor-pointer shadow-[8px_8px_0px_0px_rgba(25,9,34,1)]">
            <div className="flex justify-between items-start mb-16">
              <span className="font-label-caps text-label-caps text-ink font-bold">GENERATED PASSWORD</span>
              <button aria-label="Copy Password" className="text-ink hover:text-pink transition-colors" onClick={copyPassword}>
                <span className="material-symbols-outlined">content_copy</span>
              </button>
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
                className="w-full h-2 bg-ink appearance-none outline-none custom-slider rounded-full"
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
                <input checked={useUpper} className="w-8 h-8 border-2 border-ink bg-paper text-ink focus:ring-0 focus:ring-offset-0 checked:bg-mint cursor-pointer" type="checkbox" onChange={(event) => setUseUpper(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Lowercase</span>
                <input checked={useLower} className="w-8 h-8 border-2 border-ink bg-paper text-ink focus:ring-0 focus:ring-offset-0 checked:bg-mint cursor-pointer" type="checkbox" onChange={(event) => setUseLower(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Numbers</span>
                <input checked={useNumbers} className="w-8 h-8 border-2 border-ink bg-paper text-ink focus:ring-0 focus:ring-offset-0 checked:bg-mint cursor-pointer" type="checkbox" onChange={(event) => setUseNumbers(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between group cursor-pointer">
                <span className="font-body-md text-body-md text-ink group-hover:text-primary transition-colors font-bold">Symbols</span>
                <input checked={useSymbols} className="w-8 h-8 border-2 border-ink bg-paper text-ink focus:ring-0 focus:ring-offset-0 checked:bg-mint cursor-pointer" type="checkbox" onChange={(event) => setUseSymbols(event.target.checked)} />
              </label>
            </div>
            <button className="relative w-full mt-12 p-[2px] rounded-full overflow-hidden hover:scale-105 active:scale-100 transition-transform duration-300" onClick={regenerate}>
              <div className="absolute inset-0 generator-button-bg"></div>
              <div className="relative w-full h-full bg-ink text-paper py-4 rounded-full font-body-lg text-body-lg font-bold flex items-center justify-center">
                Regenerate
              </div>
            </button>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-2/3 h-full -z-10 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, #FFB7C3 0%, transparent 60%)' }}></div>
      </main>

      <footer className="bg-paper w-full py-12 border-t border-taupe flex flex-col md:flex-row justify-between items-center px-gutter gap-4">
        <div className="font-headline-md text-headline-md text-primary">VaultKey</div>
        <div className="flex gap-6 font-label-caps text-label-caps">
        </div>
      </footer>
    </div>
  )
}
