import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import type { VaultEntryInput } from '@/models/vault'
import { checkPasswordBreach } from '@/services/api'
import { usePageMeta } from '@/hooks/usePageMeta'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?'

// Rejection sampling: a plain `% max` over 32 random bits biases toward low values
// whenever max does not divide 2^32, which would measurably skew generated passwords.
function randomInt(max: number) {
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % max
}

function pickChar(charset: string) {
  return charset[randomInt(charset.length)]
}

function generatePassword(length: number) {
  const charset = UPPER + LOWER + NUMBERS + SYMBOLS
  const chars = [UPPER, LOWER, NUMBERS, SYMBOLS].map(pickChar)
  while (chars.length < length) {
    chars.push(pickChar(charset))
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const defaultFormState: VaultEntryInput = {
  site: '',
  username: '',
  password: '',
  notes: '',
}

const fieldLabel = 'block font-label-caps text-label-caps uppercase text-on-surface-variant mb-1'
const fieldInput =
  'input-line w-full px-1 py-2 font-body-md text-body-md text-ink placeholder:text-on-surface-variant'
const rowAction =
  'vault-btn-secondary min-h-11 px-3 inline-flex items-center justify-center font-body-md text-body-md'

export default function VaultPage() {
  usePageMeta('Your Vault · VaultKey', 'View, add, and manage your encrypted credentials.')
  const navigate = useNavigate()
  const {
    vaultData,
    isUnlocked,
    isSaving,
    clearVaultSession,
    addEntry,
    editEntry,
    removeEntry,
    saveVault,
  } = useVault()

  const [formState, setFormState] = useState<VaultEntryInput>(defaultFormState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [breachCheck, setBreachCheck] = useState<{
    password: string
    status: 'breached' | 'safe' | 'unavailable'
  } | null>(null)
  const [breachedEntryIds, setBreachedEntryIds] = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [revealPassword, setRevealPassword] = useState(false)
  const breachCheckControllerRef = useRef<AbortController | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('vaultkey_token')
    if (!storedToken) {
      navigate('/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!saveMessage) {
      return
    }
    const timeoutId = setTimeout(() => setSaveMessage(null), 4000)
    return () => clearTimeout(timeoutId)
  }, [saveMessage])

  useEffect(() => {
    const password = formState.password
    if (!password) {
      breachCheckControllerRef.current?.abort()
      breachCheckControllerRef.current = null
      return
    }

    const timeoutId = setTimeout(async () => {
      breachCheckControllerRef.current?.abort()
      const controller = new AbortController()
      breachCheckControllerRef.current = controller

      try {
        const breached = await checkPasswordBreach(password, controller.signal)
        if (!controller.signal.aborted) {
          setBreachCheck({ password, status: breached ? 'breached' : 'safe' })
        }
      } catch (checkError) {
        if (checkError instanceof DOMException && checkError.name === 'AbortError') {
          return
        }
        // A failed lookup is not a clean bill of health: say so rather than reporting "safe".
        setBreachCheck({ password, status: 'unavailable' })
      }
    }, 500)

    return () => {
      clearTimeout(timeoutId)
      breachCheckControllerRef.current?.abort()
      breachCheckControllerRef.current = null
    }
  }, [formState.password])

  const entries = useMemo(() => vaultData?.entries ?? [], [vaultData])

  // Keyed on the credentials themselves, not on vaultData's identity: every edit produces a
  // fresh object, which would otherwise re-scan the whole vault against HIBP on each keystroke.
  const breachScanKey = useMemo(
    () => entries.map((entry) => `${entry.id}:${entry.password}`).join('\u0000'),
    [entries]
  )

  useEffect(() => {
    if (!breachScanKey) {
      return
    }

    const controller = new AbortController()

    async function scanEntries() {
      const results = await Promise.all(
        entries.map(async (entry) => {
          try {
            const breached = await checkPasswordBreach(entry.password, controller.signal)
            return [entry.id, breached] as const
          } catch {
            return [entry.id, false] as const
          }
        })
      )

      if (!controller.signal.aborted) {
        setBreachedEntryIds(new Set(results.filter(([, breached]) => breached).map(([id]) => id)))
      }
    }

    void scanEntries()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breachScanKey])

  const filteredEntries = useMemo(() => {
    const ordered = [...entries].sort((a, b) =>
      a.site.localeCompare(b.site, undefined, { sensitivity: 'base' })
    )
    if (!searchQuery.trim()) {
      return ordered
    }
    const query = searchQuery.toLowerCase()
    return ordered.filter(
      (entry) =>
        entry.site.toLowerCase().includes(query) ||
        entry.username.toLowerCase().includes(query)
    )
  }, [entries, searchQuery])

  function handleLogout() {
    // Scoped to this app's keys — localStorage.clear() would also wipe unrelated
    // data stored on this origin.
    localStorage.removeItem('vaultkey_token')
    clearVaultSession()
    navigate('/')
  }

  function resetForm() {
    setFormState(defaultFormState)
    setEditingId(null)
    setRevealPassword(false)
  }

  function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaveMessage(null)

    if (!formState.site.trim() || !formState.username.trim() || !formState.password) {
      setError('Add a site, a username, and a password before saving this entry.')
      return
    }

    if (editingId) {
      editEntry(editingId, formState)
      setSaveMessage('Entry updated. Save the vault to keep it.')
    } else {
      addEntry(formState)
      setSaveMessage('Entry added. Save the vault to keep it.')
    }

    setHasUnsavedChanges(true)
    // Clear active filters so newly added/updated entries are immediately visible.
    setSearchQuery('')
    resetForm()
  }

  function handleEditStart(entryId: string) {
    const entry = entries.find((item) => item.id === entryId)
    if (!entry) {
      return
    }

    setPendingDeleteId(null)
    setEditingId(entry.id)
    setRevealPassword(false)
    setFormState({
      site: entry.site,
      username: entry.username,
      password: entry.password,
      notes: entry.notes || '',
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Without this, a keyboard user is scrolled to the form while focus stays on the row's
    // Edit button, which has just been re-rendered off-screen.
    formRef.current?.querySelector<HTMLInputElement>('#entry-site')?.focus({ preventScroll: true })
  }

  function handleConfirmDelete(entryId: string) {
    removeEntry(entryId)
    setPendingDeleteId(null)
    setHasUnsavedChanges(true)
    setSaveMessage('Entry deleted. Save the vault to keep the change.')
    if (editingId === entryId) {
      resetForm()
    }
  }

  async function handleSaveVault() {
    setError(null)
    setSaveMessage(null)

    try {
      await saveVault()
      setHasUnsavedChanges(false)
      setSaveMessage('Vault saved.')
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Could not save your vault: ${saveError.message}. Your changes are still here — try again.`
          : 'Could not save your vault. Your changes are still here — try again.'
      )
    }
  }

  async function handleCopyPassword(site: string, password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setSaveMessage(`Password for ${site} copied to clipboard.`)
    } catch {
      setError('Could not reach the clipboard. Use Edit to view and copy the password manually.')
    }
  }

  if (!isUnlocked || !vaultData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-gutter selection:bg-mint selection:text-ink">
        <div className="w-full max-w-md bg-surface-container-lowest border-2 border-ink p-8 text-center shadow-[8px_8px_0px_0px_theme(colors.ink)]">
          <h1 className="font-headline-md text-headline-md text-ink mb-3">Vault locked</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mb-8">
            Your vault is encrypted. Sign in with your master password to decrypt it in this browser.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="vault-btn-primary w-full min-h-11 px-4 font-body-md text-body-md font-bold"
          >
            Go to login
          </button>
        </div>
      </div>
    )
  }

  const entryCount = entries.length
  const isSearching = searchQuery.trim().length > 0

  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md bg-paper text-ink selection:bg-mint selection:text-ink">
      <header className="w-full py-3 bg-paper flex flex-wrap gap-x-4 gap-y-3 justify-between items-center px-gutter z-50 sticky top-0 border-b border-surface-dim">
        <Link
          to="/"
          className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity"
        >
          VaultKey
        </Link>
        <nav
          aria-label="Vault sections"
          className="order-last w-full md:order-none md:w-auto flex flex-wrap gap-x-5 gap-y-1 md:gap-8 items-center justify-center font-body-md text-body-md"
        >
          <span aria-current="page" className="text-ink border-b-2 border-ink">
            Vault
          </span>
          <Link to="/generator" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Generator</Link>
          <Link to="/vault/sharing" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Sharing</Link>
          <Link to="/vault/activity" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Activity</Link>
          <Link to="/vault/breach" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Breach</Link>
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="text-on-surface-variant hover:text-primary transition-colors duration-200"
        >
          Log Out
        </button>
      </header>

      <main className="flex-grow w-full max-w-5xl mx-auto px-margin-safe pt-12 md:pt-16 pb-24">
        <div className="text-center mb-10 md:mb-12">
          <h1 className="font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink font-bold">
            Secure Vault
          </h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            {entryCount === 0
              ? 'No credentials stored yet'
              : `${entryCount} credential${entryCount === 1 ? '' : 's'}, encrypted in this browser`}
          </p>
        </div>

        <div className="mb-10 md:w-2/3 lg:w-1/2 mx-auto relative">
          <label htmlFor="vault-search" className="sr-only">Search your logins</label>
          <span
            className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            aria-hidden="true"
          >
            search
          </span>
          <input
            id="vault-search"
            className="input-line w-full pl-8 pr-10 py-2 font-body-md text-body-md text-ink placeholder:text-on-surface-variant"
            placeholder="Search by site or username"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
            </button>
          )}
        </div>

        <div className="empty:hidden">
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 border-2 border-error bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container"
            >
              <span className="material-symbols-outlined shrink-0" aria-hidden="true">error</span>
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="shrink-0 -my-1 -mr-1 w-8 h-8 inline-flex items-center justify-center hover:opacity-70 transition-opacity"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
              </button>
            </div>
          )}
          {saveMessage && (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 border-2 border-ink bg-mint px-4 py-3 font-body-md text-body-md text-ink"
            >
              <span className="material-symbols-outlined shrink-0" aria-hidden="true">check_circle</span>
              <span className="flex-1">{saveMessage}</span>
            </div>
          )}
        </div>

        <form
          ref={formRef}
          id="vault-entry-form"
          onSubmit={handleSubmitEntry}
          className="bg-taupe border-2 border-ink p-6 md:p-8 mb-12 shadow-[8px_8px_0px_0px_theme(colors.ink)]"
        >
          <h2 className="font-headline-md text-headline-md text-ink mb-6">
            {editingId ? 'Edit entry' : 'Add an entry'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label htmlFor="entry-site" className={fieldLabel}>Site</label>
              <input
                id="entry-site"
                type="text"
                value={formState.site}
                onChange={(event) => setFormState((prev) => ({ ...prev, site: event.target.value }))}
                className={fieldInput}
                placeholder="github.com"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="entry-username" className={fieldLabel}>Username</label>
              <input
                id="entry-username"
                type="text"
                value={formState.username}
                onChange={(event) => setFormState((prev) => ({ ...prev, username: event.target.value }))}
                className={fieldInput}
                placeholder="you@example.com"
                autoComplete="off"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="entry-password" className={fieldLabel}>Password</label>
              <div className="flex flex-wrap gap-3 items-end">
                <input
                  id="entry-password"
                  type={revealPassword ? 'text' : 'password'}
                  value={formState.password}
                  onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                  className={`${fieldInput} flex-1 min-w-[12rem]`}
                  placeholder="Type one or generate"
                  autoComplete="new-password"
                />
                <div className="flex gap-3 shrink-0">
                  <button
                    type="button"
                    className={rowAction}
                    aria-pressed={revealPassword}
                    onClick={() => setRevealPassword((prev) => !prev)}
                  >
                    {revealPassword ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    className="vault-btn-primary min-h-11 px-4 inline-flex items-center justify-center font-body-md text-body-md font-bold whitespace-nowrap"
                    onClick={() => {
                      setFormState((prev) => ({ ...prev, password: generatePassword(20) }))
                      setRevealPassword(true)
                    }}
                  >
                    Generate
                  </button>
                </div>
              </div>
              <p aria-live="polite" className="mt-2 min-h-[1.5rem] font-body-md text-sm">
                {formState.password && breachCheck?.password !== formState.password && (
                  <span className="text-on-surface-variant">Checking against known breaches…</span>
                )}
                {formState.password && breachCheck?.password === formState.password && (
                  <>
                    {breachCheck.status === 'breached' && (
                      <span className="text-error font-bold">
                        This password has appeared in a known breach. Generate a new one.
                      </span>
                    )}
                    {breachCheck.status === 'safe' && (
                      <span className="text-primary">Not found in any known breach.</span>
                    )}
                    {breachCheck.status === 'unavailable' && (
                      <span className="text-on-surface-variant">
                        Could not reach the breach database — this password has not been checked.
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="entry-notes" className={fieldLabel}>
                Notes <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="entry-notes"
                type="text"
                value={formState.notes || ''}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                className={fieldInput}
                placeholder="Recovery codes are in the safe"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center mt-10">
            <button
              type="submit"
              className="vault-btn-primary min-h-11 px-5 inline-flex items-center justify-center font-body-md text-body-md font-bold"
            >
              {editingId ? 'Update entry' : 'Add entry'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className={rowAction}>
                Cancel
              </button>
            )}
            <span className="flex-1" />
            {hasUnsavedChanges && (
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveVault}
              disabled={isSaving || !hasUnsavedChanges}
              className={`min-h-11 px-5 inline-flex items-center justify-center font-body-md text-body-md font-bold border border-ink transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                hasUnsavedChanges ? 'bg-ink text-paper hover:bg-primary' : 'bg-transparent text-ink'
              }`}
            >
              {isSaving ? 'Saving…' : 'Save vault'}
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-5">
          {filteredEntries.length === 0 && (
            <div className="border-2 border-dashed border-ink/30 bg-surface-container-lowest px-6 py-12 text-center">
              {isSearching ? (
                <>
                  <p className="font-body-lg text-body-lg text-ink mb-2">
                    Nothing matches “{searchQuery}”
                  </p>
                  <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                    {entryCount === 1
                      ? 'Your one stored credential does not match this search.'
                      : `None of your ${entryCount} stored credentials match this search.`}
                  </p>
                  <button type="button" onClick={() => setSearchQuery('')} className={rowAction}>
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="font-body-lg text-body-lg text-ink mb-2">Your vault is empty</p>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Add your first credential using the form above. It is encrypted in this browser
                    before it ever reaches the server.
                  </p>
                </>
              )}
            </div>
          )}

          {filteredEntries.map((entry) => {
            const isPendingDelete = pendingDeleteId === entry.id
            const isEditing = editingId === entry.id

            return (
              <article
                key={entry.id}
                className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 border-2 bg-surface-container-lowest p-5 md:p-6 transition-colors duration-200 ${
                  isPendingDelete ? 'border-error' : isEditing ? 'border-primary' : 'border-ink'
                }`}
              >
                <div className="min-w-0">
                  <h3 className="font-headline-md text-headline-md text-ink leading-tight break-words">
                    {entry.site}
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface break-words">
                    {entry.username}
                  </p>
                  {entry.notes && (
                    <p className="mt-2 font-body-md text-sm text-on-surface-variant break-words">
                      {entry.notes}
                    </p>
                  )}
                  {breachedEntryIds.has(entry.id) && (
                    <p className="mt-3 inline-flex items-center gap-1.5 border border-error bg-error-container px-2 py-1 font-label-caps text-label-caps uppercase text-on-error-container font-bold">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">warning</span>
                      Found in a breach
                    </p>
                  )}
                </div>

                {isPendingDelete ? (
                  <div
                    className="flex flex-wrap items-center gap-3 shrink-0"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setPendingDeleteId(null)
                      }
                    }}
                  >
                    <span className="font-body-md text-body-md text-ink">
                      Delete {entry.site}?
                    </span>
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete(entry.id)}
                      className="min-h-11 px-4 inline-flex items-center justify-center border border-error bg-error text-on-error font-body-md text-body-md font-bold hover:opacity-90 transition-opacity"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className={rowAction}
                      autoFocus
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="w-11 h-11 border border-ink bg-transparent inline-flex items-center justify-center hover:bg-mint transition-colors"
                      onClick={() => handleCopyPassword(entry.site, entry.password)}
                      aria-label={`Copy password for ${entry.site}`}
                    >
                      <span className="material-symbols-outlined text-ink text-[20px]" aria-hidden="true">
                        content_copy
                      </span>
                    </button>
                    <button
                      type="button"
                      className={rowAction}
                      onClick={() => handleEditStart(entry.id)}
                      aria-label={`Edit ${entry.site}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={rowAction}
                      onClick={() => navigate('/vault/sharing')}
                      aria-label={`Share ${entry.site}`}
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      className="min-h-11 px-3 inline-flex items-center justify-center border border-ink bg-transparent font-body-md text-body-md text-on-surface-variant hover:bg-error hover:border-error hover:text-on-error transition-colors"
                      onClick={() => setPendingDeleteId(entry.id)}
                      aria-label={`Delete ${entry.site}`}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}
