import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import type { VaultEntryInput } from '@/models/vault'
import { checkPasswordBreach } from '@/services/api'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const NUMBERS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?'

function generatePassword(length: number) {
  const charset = UPPER + LOWER + NUMBERS + SYMBOLS
  let result = [UPPER, LOWER, NUMBERS, SYMBOLS].map((s) => s[Math.floor(Math.random() * s.length)]).join('')
  while (result.length < length) result += charset[Math.floor(Math.random() * charset.length)]
  const chars = result.slice(0, length).split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const defaultFormState: VaultEntryInput = {
  site: '',
  username: '',
  password: '',
  notes: '',
}

export default function VaultPage() {
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
  const [passwordBreached, setPasswordBreached] = useState(false)
  const [checkingBreach, setCheckingBreach] = useState(false)
  const [breachedEntryIds, setBreachedEntryIds] = useState<Set<string>>(new Set())
  const breachCheckControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('vaultkey_token')
    if (!storedToken) {
      navigate('/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!formState.password) {
      breachCheckControllerRef.current?.abort()
      breachCheckControllerRef.current = null
      setPasswordBreached(false)
      setCheckingBreach(false)
      return
    }

    const timeoutId = setTimeout(async () => {
      breachCheckControllerRef.current?.abort()
      const controller = new AbortController()
      breachCheckControllerRef.current = controller

      setCheckingBreach(true)
      try {
        const breached = await checkPasswordBreach(formState.password, controller.signal)
        if (!controller.signal.aborted) {
          setPasswordBreached(breached)
        }
      } catch (checkError) {
        if (checkError instanceof DOMException && checkError.name === 'AbortError') {
          return
        }
        setPasswordBreached(false)
      } finally {
        if (!controller.signal.aborted) {
          setCheckingBreach(false)
        }
      }
    }, 500)

    return () => {
      clearTimeout(timeoutId)
      breachCheckControllerRef.current?.abort()
      breachCheckControllerRef.current = null
    }
  }, [formState.password])

  useEffect(() => {
    if (!vaultData) {
      return
    }

    const entries = vaultData.entries

    let cancelled = false

    async function scanEntries() {
      const results = await Promise.all(
        entries.map(async (entry) => {
          try {
            const breached = await checkPasswordBreach(entry.password)
            return [entry.id, breached] as const
          } catch {
            return [entry.id, false] as const
          }
        })
      )

      if (!cancelled) {
        setBreachedEntryIds(new Set(results.filter(([, breached]) => breached).map(([id]) => id)))
      }
    }

    void scanEntries()

    return () => {
      cancelled = true
    }
  }, [vaultData])

  const filteredEntries = useMemo(() => {
    if (!vaultData) {
      return []
    }

    const ordered = [...vaultData.entries].sort((a, b) =>
      a.site.localeCompare(b.site, undefined, { sensitivity: 'base' })
    )
    if (!searchQuery.trim()) {
      return ordered
    }
    const query = searchQuery.toLowerCase()
    return ordered.filter((entry) =>
      entry.site.toLowerCase().includes(query) ||
      entry.username.toLowerCase().includes(query)
    )
  }, [searchQuery, vaultData])

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  function resetForm() {
    setFormState(defaultFormState)
    setEditingId(null)
  }

  function validateForm(): boolean {
    if (!formState.site.trim() || !formState.username.trim() || !formState.password) {
      setError('Site, username, and password are required')
      return false
    }
    return true
  }

  function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaveMessage(null)

    if (!validateForm()) {
      return
    }

    if (editingId) {
      editEntry(editingId, formState)
      setSaveMessage('Entry updated')
    } else {
      addEntry(formState)
      setSaveMessage('Entry added')
    }

    // Clear active filters so newly added/updated entries are immediately visible.
    setSearchQuery('')
    resetForm()
  }

  function handleEditStart(entryId: string) {
    if (!vaultData) {
      return
    }

    const entry = vaultData.entries.find((item) => item.id === entryId)
    if (!entry) {
      return
    }

    setEditingId(entry.id)
    setFormState({
      site: entry.site,
      username: entry.username,
      password: entry.password,
      notes: entry.notes || '',
    })
  }

  async function handleSaveVault() {
    setError(null)
    setSaveMessage(null)

    try {
      await saveVault()
      setSaveMessage('Vault saved')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save vault')
    }
  }

  async function handleCopyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setSaveMessage('Password copied')
    } catch {
      setError('Failed to copy password')
    }
  }

  if (!isUnlocked || !vaultData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-6">
        <div className="max-w-2xl mx-auto bg-surface-container-low rounded-lg shadow-xl p-8 text-center border border-surface-dim">
          <h1 className="text-2xl font-bold text-ink mb-3">Vault Locked</h1>
          <p className="text-on-surface-variant mb-6">Sign in to decrypt and edit your vault.</p>
          <button
            onClick={() => navigate('/login')}
            className="vault-btn-primary px-4 py-2 font-body-md font-bold"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md bg-paper text-ink">
      <header className="w-full h-16 bg-paper flex justify-between items-center px-gutter max-w-full z-50 sticky top-0 border-b border-surface-dim">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">VaultKey</Link>
        <nav className="hidden md:flex gap-8 items-center font-body-md text-body-md">
          <span className="text-ink border-b border-ink">Vault</span>
          <button onClick={() => navigate('/generator')} className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Generator</button>
          <Link to="/vault/sharing" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Sharing</Link>
          <Link to="/vault/activity" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Activity</Link>
          <Link to="/vault/breach" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Breach</Link>
        </nav>
        <div className="flex gap-4 items-center">
          <button className="vault-btn-secondary px-4 py-2 font-body-md hidden md:block" onClick={handleLogout}>Log Out</button>
          <button
            className="vault-btn-primary px-4 py-2 font-body-md font-bold"
            onClick={() => document.getElementById('vault-entry-form')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Create Login
          </button>
        </div>
      </header>

      <main className="flex-grow flex flex-col pt-hero-offset px-margin-safe pb-24">
        <div className="mb-16 space-y-8">
          <div className="w-full">
            <h1 className="font-headline-xl text-headline-xl text-ink font-bold text-center">Secure Vault</h1>
          </div>
          <div className="w-full md:w-1/3 mx-auto flex items-center relative">
            <span className="material-symbols-outlined absolute left-0 text-ink">search</span>
            <input
              className="input-line w-full pl-8 py-2 font-body-md text-body-md placeholder:text-on-surface-variant text-ink"
              placeholder="Search logins..."
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        {error && <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>}
        {saveMessage && <div className="mb-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{saveMessage}</div>}

        <form id="vault-entry-form" onSubmit={handleSubmitEntry} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 bg-taupe border-2 border-ink p-6">
          <input
            type="text"
            value={formState.site}
            onChange={(event) => setFormState((prev) => ({ ...prev, site: event.target.value }))}
            className="input-line px-2 py-2"
            placeholder="Site"
          />
          <input
            type="text"
            value={formState.username}
            onChange={(event) => setFormState((prev) => ({ ...prev, username: event.target.value }))}
            className="input-line px-2 py-2"
            placeholder="Username"
          />
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
              className="input-line px-2 py-2 flex-1"
              placeholder="Password"
            />
            <button
              type="button"
              className="vault-btn-secondary px-3 py-2 font-body-md whitespace-nowrap"
              onClick={() => setFormState((prev) => ({ ...prev, password: generatePassword(16) }))}
            >
              Generate
            </button>
          </div>
          {checkingBreach && <p className="md:col-span-2 text-sm text-on-surface-variant">Checking password...</p>}
          {!checkingBreach && passwordBreached && (
            <p className="md:col-span-2 text-sm text-red-600">This password has appeared in a known data breach.</p>
          )}
          <input
            type="text"
            value={formState.notes || ''}
            onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
            className="input-line px-2 py-2"
            placeholder="Notes"
          />

          <div className="md:col-span-2 flex gap-3">
            <button type="submit" className="vault-btn-primary px-4 py-2 font-body-md font-bold">
              {editingId ? 'Update Entry' : 'Add Entry'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="vault-btn-secondary px-4 py-2 font-body-md">
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveVault}
              disabled={isSaving}
              className="vault-btn-secondary px-4 py-2 font-body-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Vault'}
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 relative">
          <div className="col-span-1 md:col-span-12">
            <div className="flex flex-col gap-6">
              {filteredEntries.length === 0 && (
                <div className="flex items-center justify-center border border-surface-dim bg-surface-container-lowest p-6 rounded-lg shadow-sm">
                  <p className="text-on-surface-variant">No entries yet.</p>
                </div>
              )}

              {filteredEntries.map((entry, index) => (
                <div key={entry.id} className="flex flex-col md:flex-row md:items-center md:justify-between border border-surface-dim bg-surface-container-lowest p-6 rounded-lg group relative overflow-hidden shadow-sm hover:border-mint transition-colors gap-4">
                  <div className="flex items-center gap-6 z-10 relative">
                    <span className="font-body-lg text-body-lg text-on-surface-variant font-bold">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="font-headline-md text-headline-md mb-1 text-ink group-hover:text-primary transition-colors">{entry.site}</h3>
                      <p className="font-body-md text-body-md text-on-surface">{entry.username}</p>
                      {entry.notes && <p className="text-sm text-on-surface-variant mt-1">{entry.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 z-10 relative flex-wrap">
                    <span className="bg-surface-dim px-3 py-1 rounded-full font-label-caps text-label-caps text-ink font-bold">Stored</span>
                    {breachedEntryIds.has(entry.id) && (
                      <span className="bg-red-100 border border-red-300 px-3 py-1 rounded-full font-label-caps text-label-caps text-red-800 font-bold">Breached</span>
                    )}
                    <button
                      className="w-10 h-10 border border-ink flex items-center justify-center hover:bg-mint hover:border-mint transition-colors bg-white"
                      onClick={() => handleCopyPassword(entry.password)}
                      aria-label="Copy Password"
                    >
                      <span className="material-symbols-outlined text-ink">content_copy</span>
                    </button>
                    <button className="vault-btn-secondary px-3 py-1" onClick={() => handleEditStart(entry.id)}>
                      Edit
                    </button>
                    <button className="vault-btn-secondary px-3 py-1" onClick={() => navigate('/vault/sharing')}>
                      Share
                    </button>
                    <button className="vault-btn-secondary px-3 py-1" onClick={() => removeEntry(entry.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
