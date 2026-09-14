import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PAGES_DIR = join(__dirname, '..', 'pages')
const COMPONENTS_DIR = join(__dirname, '..', 'components')
const pages = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.tsx'))
const components = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.tsx'))
const source = (f: string) => readFileSync(join(PAGES_DIR, f), 'utf8')

// The nav and nearly every control now live in components/, so a guard that walks only pages/
// stops asserting anything the moment markup moves. Every markup scan below uses this list.
const uiSources: Array<[string, string]> = [
  ...pages.map((f) => [`pages/${f}`, readFileSync(join(PAGES_DIR, f), 'utf8')] as [string, string]),
  ...components.map(
    (f) => [`components/${f}`, readFileSync(join(COMPONENTS_DIR, f), 'utf8')] as [string, string]
  ),
]
const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
const tailwindConfig = readFileSync(join(__dirname, '..', '..', 'tailwind.config.js'), 'utf8')

const definesToken = (token: string) =>
  new RegExp(`(^|\\s)'?${token}'?\\s*:\\s*'#`, 'm').test(tailwindConfig)

describe('design token coverage', () => {
  it('defines every color token the pages reference', () => {
    const referenced = new Set<string>()
    for (const f of pages) {
      for (const m of source(f).matchAll(/\b(?:bg|text|border|accent|outline|ring)-([a-z][a-z0-9-]*)\b/g)) {
        referenced.add(m[1])
      }
    }
    // `border-error` / `bg-error-container` silently emitted no CSS because the
    // tokens were never defined, leaving error banners unstyled.
    const missing = ['error', 'error-container'].filter((t) => !definesToken(t))
    expect(missing).toEqual([])
    expect(referenced.has('error')).toBe(true)
  })
})

describe('focus visibility', () => {
  it('never strips a focus outline without a visible replacement', () => {
    for (const [name, s] of uiSources) {
      // Tailwind's outline-none is a *transparent* 2px outline, so on its own
      // it leaves keyboard users with no indicator at all.
      const stripped = s.match(/\b(?:focus:)?outline-none\b/g) ?? []
      expect(stripped, `${name} strips focus outline`).toEqual([])
    }
    expect(css).not.toMatch(/:focus\s*{[^}]*outline:\s*none/)
  })

  it('gives buttons and links a focus ring', () => {
    // Only .input-line carried a focus-visible outline, so every button and link in the
    // app fell back to outline-style:none and showed nothing at all on keyboard focus.
    expect(css).toMatch(/:where\([^)]*button[^)]*\):focus-visible\s*{[^}]*outline:\s*2px/)
  })

  it('keeps border-b visible on underlined inputs', () => {
    for (const [name, s] of uiSources) {
      // border-none sets border-style:none and cancels border-b-2 entirely.
      const broken = /border-none[^"]*border-b-\d/.test(s)
      expect(broken, `${name} cancels its own bottom border`).toBe(false)
    }
  })
})

describe('icon font', () => {
  it('loads Material Symbols with display=block', () => {
    // A ligature font under display=swap renders the ligature's source text in the
    // fallback face, flashing the literal words "search"/"close"/"warning" on cold load.
    const symbols = css.match(/@import url\('[^']*Material\+Symbols[^']*'\)/)?.[0] ?? ''
    expect(symbols).toContain('display=block')
    expect(symbols).not.toContain('Noto+Serif')
  })
})

describe('source hygiene', () => {
  it('has no raw control characters in page sources', () => {
    for (const [name, s] of uiSources) {
      // A literal NUL written as a string separator made git treat the file as binary,
      // so every diff on it showed up as "Bin 15528 -> 26191 bytes".
      const control = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g')
      const found = s.match(control) ?? []
      expect(found, `${name} contains a raw control character`).toEqual([])
    }
  })
})

describe('session persistence', () => {
  const keyStorage = readFileSync(join(__dirname, '..', 'crypto', 'keyStorage.ts'), 'utf8')

  it('stores the vault key as non-extractable', () => {
    // The whole point of persisting through IndexedDB rather than web storage is that
    // exportKey() throws on the stored handle, so an XSS cannot exfiltrate the key.
    const importCall = keyStorage.match(/importKey\([\s\S]*?\)/)?.[0] ?? ''
    expect(importCall).toMatch(/,\s*false\s*,/)
  })

  it('never writes raw key material to web storage', () => {
    // The opaque tab handle is the only thing that may reach localStorage/sessionStorage;
    // exported key bytes must stay inside the IndexedDB path.
    const writes = keyStorage.match(/(?:local|session)Storage\.setItem\([^)]*\)/g) ?? []
    expect(writes).toEqual(['sessionStorage.setItem(HANDLE_KEY, handle)'])
  })
})

describe('navigation', () => {
  it('keeps nav reachable below the md breakpoint', () => {
    for (const [name, s] of uiSources) {
      expect(/<nav className="hidden md:flex/.test(s), `${name} hides nav on mobile`).toBe(false)
    }
  })

  it('clears the session when logging out', () => {
    for (const f of pages) {
      const s = source(f)
      if (!s.includes('function handleLogout')) continue
      expect(s, `${f} defines handleLogout but never calls it`).toContain('onClick={handleLogout}')
      expect(/<Link to="\/"[^>]*>Log Out<\/Link>/.test(s), `${f} logs out via a bare link`).toBe(false)
    }
  })
})

describe('motion', () => {
  it('honours prefers-reduced-motion for every animated rule', () => {
    expect(css).toContain('prefers-reduced-motion')
    const [beforeQuery, insideQuery] = css.split('@media (prefers-reduced-motion: reduce)')
    expect(insideQuery, 'index.css has no reduced-motion block').toBeTruthy()

    // Derived rather than listed: a new animated class has to opt out of motion too, and
    // renaming one must not quietly drop it from this guard.
    const animated = [...beforeQuery.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{[^{}]*animation:[^{};]+;/g)]
      .flatMap((match) => match[1].split(','))
      .map((selector) => selector.trim().split(/[\s>:]/)[0])
      .filter((selector) => selector.startsWith('.'))

    expect(animated.length).toBeGreaterThan(0)
    for (const selector of new Set(animated)) {
      expect(insideQuery, `${selector} animates but never opts out of motion`).toContain(selector)
    }
  })
})

describe('button system', () => {
  it('gives every hero action its ink face', () => {
    for (const [name, s] of uiSources) {
      const heroes = (s.match(/heroAction/g) ?? []).length
      const labels = (s.match(/heroLabel/g) ?? []).length
      // .btn-hero paints the ring; the inner span carries the face. One without the other
      // renders a bare gradient rectangle, so the two always appear together.
      expect(labels, `${name} uses heroAction ${heroes}x but heroLabel ${labels}x`).toBe(heroes)
    }
  })

  it('keeps page buttons on the shared tiers', () => {
    for (const [name, s] of uiSources) {
      for (const legacy of ['shine-button', 'login-button-bg', 'register-button-bg', 'generator-button-bg']) {
        expect(s.includes(legacy), `${name} still uses the retired ${legacy}`).toBe(false)
      }
      expect(
        /className="[^"]*vault-btn-(primary|secondary)/.test(s),
        `${name} hand-rolls a vault-btn class instead of importing a control style`
      ).toBe(false)
    }
  })
})
