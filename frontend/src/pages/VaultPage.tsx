import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { VaultEntry } from '@shared/types'
import { useVault } from '@/context/VaultContext'
import type { VaultEntryInput } from '@/models/vault'
import { checkPasswordBreach, verifyAuditLog } from '@/services/api'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'
import { VAULT_NAV } from '@/components/navItems'
import Sheet from '@/components/Sheet'
import StrengthMeter from '@/components/StrengthMeter'
import Keycap from '@/components/Keycap'
import { useToast } from '@/context/ToastContext'
import { passwordStrength, reusedPasswordSet } from '@/models/passwordStrength'
import { paletteShortcutLabel } from '@/models/platform'
import {
  fieldInput,
  fieldLabel,
  outlinedAction,
  primaryAction,
  quietAction,
  quietDestructiveAction,
  quietIconAction,
} from '@/components/controlStyles'

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

function entryToFormState(entry: VaultEntry): VaultEntryInput {
  return {
    site: entry.site,
    username: entry.username,
    password: entry.password,
    notes: entry.notes || '',
  }
}

// Set by the breach page's "Change Password" action.
interface VaultRouteState {
  editEntryId?: string
  addEntry?: boolean
}

const postureLink =
  'text-on-surface-variant underline decoration-outline-variant decoration-1 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink'

export default function VaultPage() {
  usePageMeta('Your Vault · cipher', 'View, add, and manage your encrypted credentials.')
  const navigate = useNavigate()
  const location = useLocation()
  const {
    vaultData,
    token,
    isUnlocked,
    isSaving,
    clearVaultSession,
    addEntry,
    editEntry,
    removeEntry,
    saveVault,
  } = useVault()

  // Arriving from the breach page's "Change Password" opens that entry for editing.
  // Resolved before useState so it seeds the form directly instead of through an effect.
  const routeState = location.state as VaultRouteState | null
  const requestedEditId = routeState?.editEntryId
  const deepLinkedEntry = requestedEditId
    ? vaultData?.entries.find((entry) => entry.id === requestedEditId) ?? null
    : null

  const [formState, setFormState] = useState<VaultEntryInput>(
    deepLinkedEntry ? entryToFormState(deepLinkedEntry) : defaultFormState
  )
  const [editingId, setEditingId] = useState<string | null>(deepLinkedEntry?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSheetOpen, setIsSheetOpen] = useState(Boolean(deepLinkedEntry) || Boolean(routeState?.addEntry))
  const [chainStatus, setChainStatus] = useState<'pending' | 'intact' | 'broken' | 'unavailable'>(
    'pending'
  )
  const [breachCheck, setBreachCheck] = useState<{
    password: string
    status: 'breached' | 'safe' | 'unavailable'
  } | null>(null)
  const [breachedEntryIds, setBreachedEntryIds] = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [revealPassword, setRevealPassword] = useState(false)
  const breachCheckControllerRef = useRef<AbortController | null>(null)
  const pushToast = useToast()

  useEffect(() => {
    const storedToken = localStorage.getItem('cipher_token')
    if (!storedToken) {
      navigate('/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!deepLinkedEntry && !routeState?.addEntry) {
      return
    }

    // Consume the handoff so a reload, or coming Back to the vault later, does not
    // silently reopen the editor on an entry the user has moved on from.
    navigate(location.pathname, { replace: true, state: null })
    // Mount-only: the form state was already seeded from this entry above, and the
    // navigate() call below clears the route state this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // The hash-chained audit log is the product's strongest verifiable claim and it was only
  // ever visible on its own page; the vault reports it once per visit.
  useEffect(() => {
    if (!token) {
      return
    }

    let cancelled = false
    verifyAuditLog(token)
      .then((result) => {
        if (!cancelled) {
          setChainStatus(result.is_valid ? 'intact' : 'broken')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChainStatus('unavailable')
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const entries = useMemo(() => vaultData?.entries ?? [], [vaultData])

  const reusedPasswords = useMemo(
    () => reusedPasswordSet(entries.map((entry) => entry.password)),
    [entries]
  )
  const reusedCount = useMemo(
    () => entries.filter((entry) => reusedPasswords.has(entry.password)).length,
    [entries, reusedPasswords]
  )

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
    localStorage.removeItem('cipher_token')
    clearVaultSession()
    navigate('/')
  }

  function resetForm() {
    setFormState(defaultFormState)
    setEditingId(null)
    setRevealPassword(false)
  }

  function handleAddStart() {
    setPendingDeleteId(null)
    resetForm()
    setIsSheetOpen(true)
  }

  function handleSheetClose() {
    setIsSheetOpen(false)
    resetForm()
  }

  function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!formState.site.trim() || !formState.username.trim() || !formState.password) {
      setError('Add a site, a username, and a password before saving this entry.')
      return
    }

    if (editingId) {
      editEntry(editingId, formState)
      pushToast('Entry updated. Save the vault to keep it.')
    } else {
      addEntry(formState)
      pushToast('Entry added. Save the vault to keep it.')
    }

    setHasUnsavedChanges(true)
    // Clear active filters so newly added/updated entries are immediately visible.
    setSearchQuery('')
    setIsSheetOpen(false)
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
    setFormState(entryToFormState(entry))
    setIsSheetOpen(true)
  }

  function handleConfirmDelete(entryId: string) {
    removeEntry(entryId)
    setPendingDeleteId(null)
    setHasUnsavedChanges(true)
    pushToast('Entry deleted. Save the vault to keep the change.')
    if (editingId === entryId) {
      handleSheetClose()
    }
  }

  async function handleSaveVault() {
    setError(null)

    try {
      await saveVault()
      setHasUnsavedChanges(false)
      pushToast('Vault saved.')
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
      pushToast(`Password for ${site} copied to clipboard.`)
    } catch {
      setError('Could not reach the clipboard. Use Edit to view and copy the password manually.')
    }
  }

  if (!isUnlocked || !vaultData) {
    return (
      <div className="min-h-screen flex flex-col bg-paper selection:bg-mint selection:text-ink">
        <AppHeader />
        <div className="flex-grow flex items-center justify-center px-gutter py-16">
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
      </div>
    )
  }

  const entryCount = entries.length
  const isSearching = searchQuery.trim().length > 0

  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md bg-paper text-ink selection:bg-mint selection:text-ink">
      <AppHeader
        nav={VAULT_NAV}
        navLabel="Vault sections"
        action={
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center min-h-11 font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors duration-200"
          >
            Log Out
          </button>
        }
      />

      <main className="flex-grow w-full max-w-5xl mx-auto px-margin-safe pt-12 md:pt-16 pb-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <h1 className="font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink font-bold">
              Secure Vault
            </h1>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              {entryCount === 0
                ? 'No credentials stored yet'
                : `${entryCount} credential${entryCount === 1 ? '' : 's'}, encrypted in this browser`}
              {reusedCount > 0 && (
                <>
                  {' · '}
                  <span className="text-ink whitespace-nowrap">{reusedCount} reuse a password</span>
                </>
              )}
              {breachedEntryIds.size > 0 && (
                <>
                  {' · '}
                  <Link to="/vault/breach" className={`${postureLink} whitespace-nowrap`}>
                    {breachedEntryIds.size} found in breaches
                  </Link>
                </>
              )}
              {chainStatus === 'intact' && (
                <>
                  {' · '}
                  <Link to="/vault/activity" className={`${postureLink} whitespace-nowrap`}>
                    audit chain intact
                  </Link>
                </>
              )}
              {chainStatus === 'broken' && (
                <>
                  {' · '}
                  <Link to="/vault/activity" className={`${postureLink} text-error font-bold whitespace-nowrap`}>
                    audit chain broken
                  </Link>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddStart}
            className="vault-btn-primary self-start md:self-end shrink-0 min-h-11 px-5 inline-flex items-center justify-center gap-2 font-body-md text-body-md font-bold"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>
            Add credential
          </button>
        </div>

        <div className="mt-10 mb-6 flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
          <div className="relative flex-1">
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
            {isSearching ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
              </button>
            ) : (
              /* A hint, not a control: the palette answers to the shortcut itself, and a
                 keyboard affordance means nothing on a touch device. */
              <Keycap className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 hidden md:block">
                {paletteShortcutLabel}
              </Keycap>
            )}
          </div>

          <div className="flex items-center justify-end gap-4 shrink-0">
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
        </div>

        {/* Save and clipboard failures stay in the flow: a toast that has already faded
            is the wrong place for something the user still has to act on. */}
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

        {filteredEntries.length === 0 ? (
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
                <button type="button" onClick={() => setSearchQuery('')} className={outlinedAction}>
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="font-body-lg text-body-lg text-ink mb-2">Your vault is empty</p>
                <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                  Everything you add is encrypted in this browser before it ever reaches the
                  server.
                </p>
                <button type="button" onClick={handleAddStart} className={outlinedAction}>
                  Add your first credential
                </button>
              </>
            )}
          </div>
        ) : (
          <ul className="-mx-3 border-y border-outline-variant divide-y divide-outline-variant">
            {filteredEntries.map((entry) => {
              const isPendingDelete = pendingDeleteId === entry.id

              return (
                <li
                  key={entry.id}
                  className={`flex flex-col gap-3 px-3 py-4 md:flex-row md:items-center md:gap-6 md:py-3 ${
                    isPendingDelete ? 'bg-error-container' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-body-lg text-body-lg text-ink break-words">
                        {entry.site}
                      </h3>
                      <span className="font-body-md text-body-md text-on-surface-variant break-words">
                        {entry.username}
                      </span>
                      {breachedEntryIds.has(entry.id) && (
                        <span className="inline-flex items-center gap-1.5 border border-error bg-error-container px-2 py-0.5 font-label-caps text-label-caps uppercase font-bold text-on-error-container">
                          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">warning</span>
                          Found in a breach
                        </span>
                      )}
                      {reusedPasswords.has(entry.password) && (
                        <span className="inline-flex items-center border border-outline-variant px-2 py-0.5 font-label-caps text-label-caps uppercase text-on-surface-variant">
                          Reused
                        </span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="mt-1 font-body-md text-sm text-on-surface-variant truncate">
                        {entry.notes}
                      </p>
                    )}
                  </div>

                  {/* One line on a phone (meter left, actions right); at md the wrapper
                      dissolves so both sit in the row's own flex track. */}
                  <div className="flex items-center gap-4 md:contents">
                    <StrengthMeter
                      password={entry.password}
                      className="w-28 md:w-32 shrink-0"
                    />

                    {isPendingDelete ? (
                      <div
                        className="flex flex-wrap items-center gap-3 shrink-0 ml-auto md:ml-0"
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
                          className={outlinedAction}
                          autoFocus
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1 shrink-0 ml-auto md:ml-0">
                        <button
                          type="button"
                          className={quietIconAction}
                          onClick={() => handleCopyPassword(entry.site, entry.password)}
                          aria-label={`Copy password for ${entry.site}`}
                        >
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                            content_copy
                          </span>
                        </button>
                        <button
                          type="button"
                          className={quietAction}
                          onClick={() => handleEditStart(entry.id)}
                          aria-label={`Edit ${entry.site}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={quietAction}
                          onClick={() => navigate('/vault/sharing')}
                          aria-label={`Share ${entry.site}`}
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          className={quietDestructiveAction}
                          onClick={() => setPendingDeleteId(entry.id)}
                          aria-label={`Delete ${entry.site}`}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      <Sheet
        open={isSheetOpen}
        onClose={handleSheetClose}
        title={editingId ? 'Edit entry' : 'Add an entry'}
      >
        <form id="vault-entry-form" onSubmit={handleSubmitEntry}>
          <div className="grid grid-cols-1 gap-y-5">
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

            <div>
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
                    className={outlinedAction}
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
              <div className="mt-3 flex items-end gap-4">
                <StrengthMeter password={formState.password} className="flex-1" />
                {formState.password && (
                  // The bit estimate is only meaningful when no recognisable pattern is
                  // carrying the password; naming the pattern is the useful thing to say.
                  <span className="shrink-0 font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {passwordStrength(formState.password).reason === 'common-pattern'
                      ? 'contains a common word'
                      : `≈${passwordStrength(formState.password).bits} bits`}
                  </span>
                )}
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

            <div>
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

          <div className="flex flex-wrap gap-3 items-center mt-8">
            <button
              type="submit"
              className={primaryAction}
            >
              {editingId ? 'Update entry' : 'Add entry'}
            </button>
            <button type="button" onClick={handleSheetClose} className={outlinedAction}>
              Cancel
            </button>
          </div>
        </form>
      </Sheet>

    </div>
  )
}
