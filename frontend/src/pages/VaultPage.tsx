import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import type { VaultEntryInput } from '@/models/vault'
import type { AuditLogEntry, AuditLogVerifyResponse, SharedInboxItem } from '@shared/types'
import { checkPasswordBreach, createShare, deleteSharedItem, getAuditLog, getJwtSubject, getSharedWithMe, getSharingKeys, initShare, registerSharingKeys, verifyAuditLog } from '../services/api'
import {
  createShareEnvelope,
  decryptShareEnvelope,
  exportSharingPrivateKeyPkcs8,
  exportSharingPublicKeyBase64,
  generateUserSharingKeyPair,
  parseCanonicalAad,
  protectSharingPrivateKey,
  unprotectSharingPrivateKey,
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
  const [sharePermission, setSharePermission] = useState<'read_only' | 'read_write'>('read_write')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [sharingSetupLoading, setSharingSetupLoading] = useState(false)
  const [sharingSetupMessage, setSharingSetupMessage] = useState<string | null>(null)
  const [sharingSetupError, setSharingSetupError] = useState<string | null>(null)
  const [sharedInboxItems, setSharedInboxItems] = useState<SharedInboxItem[]>([])
  const [sharedInboxLoading, setSharedInboxLoading] = useState(false)
  const [sharedInboxError, setSharedInboxError] = useState<string | null>(null)
  const [sharedKeyMaterial, setSharedKeyMaterial] = useState<{
    sharing_public_key: string
    encrypted_private_key: string
    encrypted_private_key_iv: string
    algorithm: string
  } | null>(null)
  const [openedShare, setOpenedShare] = useState<{
    shareId: string
    entry: { site: string; username: string; password: string; notes?: string }
  } | null>(null)
  const [openingShareId, setOpeningShareId] = useState<string | null>(null)
  const [openShareError, setOpenShareError] = useState<string | null>(null)
  const [deletingShareId, setDeletingShareId] = useState<string | null>(null)
  const [deleteShareError, setDeleteShareError] = useState<string | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditVerifyResult, setAuditVerifyResult] = useState<AuditLogVerifyResponse | null>(null)
  const [auditVerifyLoading, setAuditVerifyLoading] = useState(false)

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
    if (!token || !isUnlocked) {
      setSharedInboxItems([])
      setSharedKeyMaterial(null)
      setAuditEntries([])
      setAuditVerifyResult(null)
      return
    }

    const accessToken = token
    let cancelled = false

    async function loadSharedInbox() {
      setSharedInboxLoading(true)
      setAuditLoading(true)
      setSharedInboxError(null)
      setAuditError(null)

      const [sharedItemsResult, keysResult, auditResult] = await Promise.allSettled([
        getSharedWithMe(accessToken),
        getSharingKeys(accessToken),
        getAuditLog(accessToken),
      ])

      if (cancelled) {
        return
      }

      if (sharedItemsResult.status === 'fulfilled') {
        setSharedInboxItems(sharedItemsResult.value)
      } else {
        setSharedInboxError(sharedItemsResult.reason instanceof Error ? sharedItemsResult.reason.message : 'Failed to load shared items')
        setSharedInboxItems([])
      }

      if (keysResult.status === 'fulfilled') {
        setSharedKeyMaterial(keysResult.value)
      } else {
        setSharedKeyMaterial(null)
      }

      if (auditResult.status === 'fulfilled') {
        setAuditEntries(auditResult.value)
      } else {
        setAuditError(auditResult.reason instanceof Error ? auditResult.reason.message : 'Failed to load audit log')
        setAuditEntries([])
      }

      setSharedInboxLoading(false)
      setAuditLoading(false)
    }

    loadSharedInbox()

    return () => {
      cancelled = true
    }
  }, [isUnlocked, token])

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
      await refreshAuditLog()
    } catch (error) {
      setSharingSetupError(error instanceof Error ? error.message : 'Failed to set up sharing keys')
    } finally {
      setSharingSetupLoading(false)
    }
  }

  async function handleOpenSharedItem(item: SharedInboxItem) {
    if (!token || !vaultKey || !currentUserId || !sharedKeyMaterial) {
      setOpenShareError('Generate and unlock sharing keys before opening shared entries')
      return
    }

    setOpeningShareId(item.share_id)
    setOpenShareError(null)

    try {
      const recipientPrivateKey = await unprotectSharingPrivateKey(
        sharedKeyMaterial.encrypted_private_key,
        sharedKeyMaterial.encrypted_private_key_iv,
        vaultKey,
      )

      const decryptedPayload = await decryptShareEnvelope({
        senderEphemeralPublicKeyBase64: item.sender_ephemeral_public_key,
        wrappedCekBase64: item.wrapped_cek,
        wrappedCekIvBase64: item.wrapped_cek_iv,
        payloadCiphertextBase64: item.payload_ciphertext,
        payloadIvBase64: item.payload_iv,
        aad: item.aad,
        recipientPrivateKey,
        expectedRecipientUserId: currentUserId,
      })

      const entry = JSON.parse(decryptedPayload) as {
        site?: string
        username?: string
        password?: string
        notes?: string
      }

      if (!entry.site || !entry.username || !entry.password) {
        throw new Error('Shared credential payload is incomplete')
      }

      setOpenedShare({
        shareId: item.share_id,
        entry: {
          site: entry.site,
          username: entry.username,
          password: entry.password,
          notes: entry.notes,
        },
      })
    } catch (error) {
      setOpenShareError(error instanceof Error ? error.message : 'Failed to open shared credential')
      setOpenedShare(null)
    } finally {
      setOpeningShareId(null)
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
        item_label: `${selectedShareEntry.site} / ${selectedShareEntry.username}`,
        version: 1,
        permission: sharePermission,
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
        permission: sharePermission,
      })

      setShareStatus(
        `Shared ${selectedShareEntry.site} with ${shareRecipientEmail.trim()}`
      )
      setShareTargetId(null)
      setShareRecipientEmail('')
      await refreshAuditLog()
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Failed to share credential')
    } finally {
      setShareLoading(false)
    }
  }

  async function handleDeleteSharedItem(shareId: string) {
    if (!token) {
      setDeleteShareError('Sign in to delete shared items')
      return
    }

    setDeleteShareError(null)
    setOpenShareError(null)
    setDeletingShareId(shareId)

    try {
      await deleteSharedItem(token, shareId)
      setSharedInboxItems((prev) => prev.filter((item) => item.share_id !== shareId))
      if (openedShare?.shareId === shareId) {
        setOpenedShare(null)
      }
      await refreshAuditLog()
    } catch (error) {
      setDeleteShareError(error instanceof Error ? error.message : 'Failed to delete shared item')
    } finally {
      setDeletingShareId(null)
    }
  }

  async function refreshAuditLog() {
    if (!token) {
      return
    }

    try {
      setAuditLoading(true)
      setAuditError(null)
      const entries = await getAuditLog(token)
      setAuditEntries(entries)
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Failed to load audit log')
    } finally {
      setAuditLoading(false)
    }
  }

  async function handleVerifyAuditLog() {
    if (!token) {
      return
    }

    try {
      setAuditVerifyLoading(true)
      setAuditError(null)
      setAuditVerifyResult(await verifyAuditLog(token))
      await refreshAuditLog()
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Failed to verify audit log')
      setAuditVerifyResult(null)
    } finally {
      setAuditVerifyLoading(false)
    }
  }

  function formatAuditAction(action: string) {
    return action
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
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
      await refreshAuditLog()
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

          <div className="mt-6 border-t border-surface-dim pt-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-headline-sm text-headline-sm text-ink">Shared with me</h3>
              <span className="text-xs uppercase tracking-[0.14em] text-on-surface-variant font-bold">{sharedInboxItems.length} item{sharedInboxItems.length === 1 ? '' : 's'}</span>
            </div>

            {sharedInboxLoading && <p className="text-sm text-on-surface-variant">Loading shared items...</p>}
            {sharedInboxError && <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{sharedInboxError}</div>}

            {!sharedInboxLoading && sharedInboxItems.length === 0 && (
              <p className="text-sm text-on-surface-variant">No shared credentials yet.</p>
            )}

            {!sharedInboxLoading && sharedInboxItems.length > 0 && (
              <div className="space-y-3">
                {sharedInboxItems.map((item) => {
                  let aadMeta: { item_id?: string; permission?: string; from_user_id?: string; item_label?: string } | null = null
                  try {
                    aadMeta = parseCanonicalAad(item.aad)
                  } catch {
                    aadMeta = null
                  }

                  const isOpened = openedShare?.shareId === item.share_id

                  return (
                    <div key={item.share_id} className="rounded-md border border-surface-dim bg-white p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-bold text-ink">From: {item.from_user_email ?? aadMeta?.from_user_id ?? 'Unknown sender'}</p>
                          <p className="text-sm text-on-surface-variant">Item: {item.item_label ?? aadMeta?.item_label ?? 'Shared credential'}</p>
                        </div>
                        <span className="rounded-full bg-surface-dim px-2 py-1 text-xs font-bold text-ink">
                          {item.permission === 'read_only' ? 'Read only' : 'Read and write'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-on-surface-variant">
                        <span>Shared: {new Date(item.shared_at).toLocaleString()}</span>
                        <span>Version: {item.version}</span>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          className="vault-btn-secondary px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleOpenSharedItem(item)}
                          disabled={openingShareId === item.share_id || !sharedKeyMaterial || !vaultKey}
                        >
                          {openingShareId === item.share_id ? 'Opening...' : 'Open'}
                        </button>
                        <button
                          type="button"
                          className="vault-btn-secondary px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleDeleteSharedItem(item.share_id)}
                          disabled={deletingShareId === item.share_id}
                        >
                          {deletingShareId === item.share_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>

                      {isOpened && openedShare && (
                        <div className="mt-4 rounded-md border border-mint bg-mint/5 p-3 space-y-2">
                          <p className="font-bold text-ink">{openedShare.entry.site}</p>
                          <p className="text-sm text-on-surface-variant">Username: {openedShare.entry.username}</p>
                          <p className="text-sm text-on-surface-variant break-all">Password: {openedShare.entry.password}</p>
                          {openedShare.entry.notes && (
                            <p className="text-sm text-on-surface-variant">Notes: {openedShare.entry.notes}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {openShareError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{openShareError}</div>}
            {deleteShareError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{deleteShareError}</div>}
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

            <div>
              <label className="block mb-2 text-sm font-bold text-ink" htmlFor="share-permission">Share permission</label>
              <select
                id="share-permission"
                value={sharePermission}
                onChange={(event) => setSharePermission(event.target.value as 'read_only' | 'read_write')}
                className="input-line w-full px-3 py-2"
              >
                <option value="read_write">Read and write</option>
                <option value="read_only">Read only</option>
              </select>
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

        <section className="mb-10 border border-surface-dim bg-surface-container-lowest p-6 rounded-lg shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-on-surface-variant font-bold">Audit log</p>
              <h2 className="font-headline-md text-headline-md mb-2 text-ink">Tamper-evident activity chain</h2>
              <p className="text-sm text-on-surface-variant">Hash-linked account events, newest first.</p>
            </div>
            <button
              type="button"
              className="vault-btn-secondary px-4 py-2 font-body-md whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleVerifyAuditLog}
              disabled={auditVerifyLoading || auditLoading}
            >
              {auditVerifyLoading ? 'Verifying...' : 'Verify chain integrity'}
            </button>
          </div>

          {auditVerifyResult && (
            <div className={`mt-4 p-3 rounded-md border text-sm ${auditVerifyResult.is_valid ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
              {auditVerifyResult.is_valid
                ? `Chain valid across ${auditVerifyResult.checked_entries} entries`
                : `Chain invalid at entry ${auditVerifyResult.broken_entry_id ?? 'unknown'}`}
            </div>
          )}

          {auditError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{auditError}</div>}
          {auditLoading && <p className="mt-4 text-sm text-on-surface-variant">Loading audit log...</p>}

          {!auditLoading && auditEntries.length === 0 && (
            <p className="mt-4 text-sm text-on-surface-variant">No audit entries yet.</p>
          )}

          {!auditLoading && auditEntries.length > 0 && (
            <div className="mt-6 space-y-3">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-surface-dim bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-ink">{formatAuditAction(entry.action)}</p>
                      <p className="text-sm text-on-surface-variant">{new Date(entry.occurred_at).toLocaleString()}</p>
                    </div>
                    <span className="rounded-full bg-surface-dim px-2 py-1 text-xs font-bold text-ink">
                      {entry.entry_hash.slice(0, 12)}
                    </span>
                  </div>

                  {Object.keys(entry.metadata).length > 0 && (
                    <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-on-surface-variant">
                      {Object.entries(entry.metadata).map(([key, value]) => (
                        <div key={key} className="rounded border border-surface-dim px-3 py-2">
                          <dt className="font-bold text-ink">{formatAuditAction(key)}</dt>
                          <dd className="break-all">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}
            </div>
          )}
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