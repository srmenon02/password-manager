import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import type { VaultEntryInput } from '@/models/vault'
import { checkPasswordBreach, createShare, getJwtSubject, initShare, registerSharingKeys } from '../services/api'
import {
  createShareEnvelope,
  exportSharingPrivateKeyPkcs8,
  exportSharingPublicKeyBase64,
  generateUserSharingKeyPair,
  protectSharingPrivateKey,
} from '@/crypto/sharingProtocol'

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
    vaultKey,
    token,
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
  const [shareTargetId, setShareTargetId] = useState<string | null>(null)
  const [shareRecipientEmail, setShareRecipientEmail] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [sharingSetupLoading, setSharingSetupLoading] = useState(false)
  const [sharingSetupMessage, setSharingSetupMessage] = useState<string | null>(null)
  const [sharingSetupError, setSharingSetupError] = useState<string | null>(null)

  const currentUserId = useMemo(() => (token ? getJwtSubject(token) : null), [token])
  const selectedShareEntry = useMemo(
    () => vaultData?.entries.find((entry) => entry.id === shareTargetId) ?? null,
    [shareTargetId, vaultData]
  )

  useEffect(() => {
    const token = localStorage.getItem('vaultkey_token')
    if (!token) {
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
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
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

    let cancelled = false

    async function scanEntries() {
      const results = await Promise.all(
        vaultData!.entries.map(async (entry) => {
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

    scanEntries()

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

  const breachedEntries = useMemo(
    () => filteredEntries.filter((entry) => breachedEntryIds.has(entry.id)),
    [filteredEntries, breachedEntryIds]
  )

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  function resetForm() {
    setFormState(defaultFormState)
    setEditingId(null)
  }

  function selectShareTarget(entryId: string) {
    setShareTargetId(entryId)
    setShareError(null)
    setShareStatus(null)
  }

  async function handleSetupSharingKeys() {
    if (!token || !vaultKey) {
      setSharingSetupError('Unlock the vault before generating sharing keys')
      return
    }

    setSharingSetupError(null)
    setSharingSetupMessage(null)
    setSharingSetupLoading(true)

    try {
      const keyPair = await generateUserSharingKeyPair()
      const sharingPublicKey = await exportSharingPublicKeyBase64(keyPair.publicKey)
      const sharingPrivateKeyPkcs8 = await exportSharingPrivateKeyPkcs8(keyPair.privateKey)
      const protectedPrivateKey = await protectSharingPrivateKey(sharingPrivateKeyPkcs8, vaultKey)

      await registerSharingKeys(token, {
        sharing_public_key: sharingPublicKey,
        encrypted_private_key: protectedPrivateKey.encryptedPrivateKey,
        encrypted_private_key_iv: protectedPrivateKey.encryptedPrivateKeyIv,
        algorithm: 'ECDH-P256-HKDF-AES256GCM',
      })

      setSharingSetupMessage('Sharing keys generated and registered')
    } catch (error) {
      setSharingSetupError(error instanceof Error ? error.message : 'Failed to set up sharing keys')
    } finally {
      setSharingSetupLoading(false)
    }
  }

  async function handleShareSelectedEntry() {
    if (!token || !currentUserId || !selectedShareEntry) {
      setShareError('Select a credential to share')
      return
    }

    if (!shareRecipientEmail.trim()) {
      setShareError('Recipient email is required')
      return
    }

    setShareLoading(true)
    setShareError(null)
    setShareStatus(null)

    try {
      const recipient = await initShare(token, {
        recipient_email: shareRecipientEmail.trim(),
      })

      const aad = {
        from_user_id: currentUserId,
        to_user_id: recipient.recipient_user_id,
        item_id: selectedShareEntry.id,
        version: 1,
      }

      const envelope = await createShareEnvelope({
        payloadJson: JSON.stringify(selectedShareEntry),
        recipientPublicKeyBase64: recipient.recipient_sharing_public_key,
        aad,
        version: 1,
      })

      const createdShare = await createShare(token, {
        to_user_id: recipient.recipient_user_id,
        sender_ephemeral_public_key: envelope.senderEphemeralPublicKey,
        wrapped_cek: envelope.wrappedCek,
        wrapped_cek_iv: envelope.wrappedCekIv,
        payload_ciphertext: envelope.payloadCiphertext,
        payload_iv: envelope.payloadIv,
        aad: envelope.aad,
        algorithm: envelope.algorithm,
        version: envelope.version,
      })

      setShareStatus(
        `Shared ${selectedShareEntry.site} with ${shareRecipientEmail.trim()} (share ${createdShare.share_id})`
      )
      setShareTargetId(null)
      setShareRecipientEmail('')
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Failed to share credential')
    } finally {
      setShareLoading(false)
    }
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
    } else {
      addEntry(formState)
    }

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
          <span className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Vault</span>
          <button onClick={() => navigate('/generator')} className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Generator</button>
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
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div className="w-full md:w-2/3 ml-0 md:ml-[15%]">
            <h1 className="font-headline-xl text-headline-xl mb-4 text-ink font-bold">Secure Vault</h1>
          </div>
          <div className="w-full md:w-1/3 flex items-center relative">
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

        <section className="mb-10 border border-red-200 bg-red-50 p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-red-700 font-bold">Breach dashboard</p>
              <h2 className="font-headline-md text-headline-md text-ink mt-2">Password exposure overview</h2>
            </div>
            <span className="rounded-full bg-red-100 border border-red-300 px-3 py-1 text-sm font-bold text-red-800">
              {breachedEntries.length} exposed
            </span>
          </div>

          {breachedEntries.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {breachedEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-red-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink">{entry.site}</p>
                      <p className="text-sm text-on-surface-variant">{entry.username}</p>
                    </div>
                    <span className="bg-red-100 border border-red-300 px-2 py-1 rounded-full text-xs font-bold text-red-800">Breached</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-on-surface-variant">No breached credentials detected in this vault.</p>
          )}
        </section>

        <section className="mb-10 border border-surface-dim bg-surface-container-lowest p-6 rounded-lg shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-headline-md text-headline-md mb-2 text-ink">Secure Sharing</h2>
              <p className="text-sm text-on-surface-variant">
                Generate a sharing keypair once, then share a credential with a recipient who has also registered sharing keys.
              </p>
            </div>
            <button
              type="button"
              className="vault-btn-secondary px-4 py-2 font-body-md whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSetupSharingKeys}
              disabled={sharingSetupLoading}
            >
              {sharingSetupLoading ? 'Generating...' : 'Generate sharing keys'}
            </button>
          </div>

          {sharingSetupError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{sharingSetupError}</div>}
          {sharingSetupMessage && <div className="mt-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{sharingSetupMessage}</div>}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 text-sm font-bold text-ink" htmlFor="share-recipient-email">Recipient email</label>
              <input
                id="share-recipient-email"
                type="email"
                value={shareRecipientEmail}
                onChange={(event) => setShareRecipientEmail(event.target.value)}
                className="input-line w-full px-3 py-2"
                placeholder="recipient@example.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-ink">Selected credential</span>
              <div className="border border-surface-dim rounded-md bg-white px-3 py-2 text-sm text-on-surface-variant min-h-[44px] flex items-center">
                {selectedShareEntry ? `${selectedShareEntry.site} / ${selectedShareEntry.username}` : 'Pick an entry below'}
              </div>
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-3 items-center">
              <button
                type="button"
                className="vault-btn-primary px-4 py-2 font-body-md font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleShareSelectedEntry}
                disabled={shareLoading || !selectedShareEntry}
              >
                {shareLoading ? 'Sharing...' : 'Share selected credential'}
              </button>
              {shareTargetId && (
                <button
                  type="button"
                  className="vault-btn-secondary px-4 py-2 font-body-md"
                  onClick={() => setShareTargetId(null)}
                >
                  Clear selection
                </button>
              )}
            </div>
          </div>

          {shareError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{shareError}</div>}
          {shareStatus && <div className="mt-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{shareStatus}</div>}

          <p className="mt-4 text-xs text-on-surface-variant">
            Shared items are encrypted in the browser before they are sent to the server. The recipient must have sharing keys registered first.
          </p>
        </section>

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
                    <button className="vault-btn-secondary px-3 py-1" onClick={() => selectShareTarget(entry.id)}>
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

        <div className="mt-8">
          <button className="vault-btn-secondary px-4 py-2 font-body-md" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </main>

      <footer className="w-full py-12 bg-paper border-t border-surface-dim flex flex-col md:flex-row justify-between items-center px-gutter gap-4 mt-auto">
        <div className="font-headline-md text-headline-md text-primary font-bold">VaultKey</div>
      </footer>
    </div>
  )
}