import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import type { SharedInboxItem } from '@shared/types'
import {
  createShare,
  deleteSharedItem,
  getJwtSubject,
  getSharedWithMe,
  getSharingKeys,
  initShare,
  registerSharingKeys,
} from '@/services/api'
import {
  createShareEnvelope,
  decryptShareEnvelope,
  exportSharingPrivateKeyPkcs8,
  exportSharingPublicKeyBase64,
  generateUserSharingKeyPair,
  protectSharingPrivateKey,
  unprotectSharingPrivateKey,
} from '@/crypto/sharingProtocol'

function VaultSharingPage() {
  const navigate = useNavigate()
  const { vaultData, vaultKey, token, isUnlocked, clearVaultSession } = useVault()

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  const [shareTargetId, setShareTargetId] = useState<string | null>(null)
  const [shareRecipientEmail, setShareRecipientEmail] = useState('')
  const [sharePermission] = useState<'read_only' | 'read_write'>('read_write')
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

  const [openedShares, setOpenedShares] = useState<Record<string, { site: string; username: string; password: string }>>({})
  const [openShareError, setOpenShareError] = useState<string | null>(null)
  const [deletingShareId, setDeletingShareId] = useState<string | null>(null)
  const [deleteShareError, setDeleteShareError] = useState<string | null>(null)

  const currentUserId = useMemo(() => (token ? getJwtSubject(token) : null), [token])

  const selectedShareEntry = useMemo(
    () => vaultData?.entries.find((entry) => entry.id === shareTargetId) ?? null,
    [shareTargetId, vaultData]
  )

  const orderedEntries = useMemo(() => {
    if (!vaultData) {
      return []
    }

    return [...vaultData.entries].sort((a, b) =>
      a.site.localeCompare(b.site, undefined, { sensitivity: 'base' })
    )
  }, [vaultData])

  useEffect(() => {
    const localToken = localStorage.getItem('vaultkey_token')
    if (!localToken) {
      navigate('/login')
    }
  }, [navigate])

  async function loadSharedInbox(accessToken: string) {
    setSharedInboxLoading(true)
    setSharedInboxError(null)

    const [sharedItemsResult, keysResult] = await Promise.allSettled([
      getSharedWithMe(accessToken),
      getSharingKeys(accessToken),
    ])

    if (sharedItemsResult.status === 'fulfilled') {
      setSharedInboxItems(sharedItemsResult.value)
    } else {
      setSharedInboxItems([])
      setSharedInboxError(sharedItemsResult.reason instanceof Error ? sharedItemsResult.reason.message : 'Failed to load shared items')
    }

    if (keysResult.status === 'fulfilled') {
      setSharedKeyMaterial(keysResult.value)
    } else {
      setSharedKeyMaterial(null)
    }

    setSharedInboxLoading(false)
  }

  useEffect(() => {
    if (!token || !isUnlocked) {
      setSharedInboxItems([])
      setSharedKeyMaterial(null)
      return
    }

    void loadSharedInbox(token)
  }, [isUnlocked, token])

  useEffect(() => {
    if (!vaultKey || !currentUserId || !sharedKeyMaterial || sharedInboxItems.length === 0) {
      setOpenedShares({})
      return
    }

    const keyMaterial = sharedKeyMaterial
    const activeVaultKey = vaultKey
    const recipientUserId = currentUserId

    let cancelled = false

    async function decryptSharedItems() {
      setOpenShareError(null)

      try {
        const recipientPrivateKey = await unprotectSharingPrivateKey(
          keyMaterial.encrypted_private_key,
          keyMaterial.encrypted_private_key_iv,
          activeVaultKey,
        )

        const decrypted = await Promise.all(
          sharedInboxItems.map(async (item) => {
            try {
              const decryptedPayload = await decryptShareEnvelope({
                senderEphemeralPublicKeyBase64: item.sender_ephemeral_public_key,
                wrappedCekBase64: item.wrapped_cek,
                wrappedCekIvBase64: item.wrapped_cek_iv,
                payloadCiphertextBase64: item.payload_ciphertext,
                payloadIvBase64: item.payload_iv,
                aad: item.aad,
                recipientPrivateKey,
                expectedRecipientUserId: recipientUserId,
              })

              const entry = JSON.parse(decryptedPayload) as {
                site?: string
                username?: string
                password?: string
              }

              if (!entry.site || !entry.username || !entry.password) {
                return null
              }

              return {
                shareId: item.share_id,
                entry: {
                  site: entry.site,
                  username: entry.username,
                  password: entry.password,
                },
              }
            } catch {
              return null
            }
          })
        )

        if (cancelled) {
          return
        }

        const nextOpenedShares: Record<string, { site: string; username: string; password: string }> = {}
        for (const item of decrypted) {
          if (item) {
            nextOpenedShares[item.shareId] = item.entry
          }
        }
        setOpenedShares(nextOpenedShares)
      } catch (error) {
        if (cancelled) {
          return
        }
        setOpenShareError(error instanceof Error ? error.message : 'Failed to decrypt shared credentials')
        setOpenedShares({})
      }
    }

    void decryptSharedItems()

    return () => {
      cancelled = true
    }
  }, [sharedInboxItems, sharedKeyMaterial, vaultKey, currentUserId])

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
      await loadSharedInbox(token)
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

      await createShare(token, {
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

      setShareStatus(`Shared ${selectedShareEntry.site} with ${shareRecipientEmail.trim()}`)
      setShareTargetId(null)
      setShareRecipientEmail('')
      await loadSharedInbox(token)
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
      setOpenedShares((prev) => {
        const next = { ...prev }
        delete next[shareId]
        return next
      })
    } catch (error) {
      setDeleteShareError(error instanceof Error ? error.message : 'Failed to delete shared item')
    } finally {
      setDeletingShareId(null)
    }
  }

  if (!isUnlocked || !vaultData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-6">
        <div className="max-w-2xl mx-auto bg-surface-container-low rounded-lg shadow-xl p-8 text-center border border-surface-dim">
          <h1 className="text-2xl font-bold text-ink mb-3">Vault Locked</h1>
          <p className="text-on-surface-variant mb-6">Sign in to decrypt and use secure sharing.</p>
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
          <Link to="/vault" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Vault</Link>
          <button onClick={() => navigate('/generator')} className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Generator</button>
          <span className="text-ink border-b border-ink">Sharing</span>
          <Link to="/vault/activity" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Activity</Link>
          <Link to="/vault/breach" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Breach</Link>
        </nav>
        <div className="flex gap-4 items-center">
          <button className="vault-btn-primary px-4 py-2 font-body-md font-bold" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      <main className="flex-grow flex flex-col pt-10 px-margin-safe pb-24">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-on-surface-variant font-bold"></p>
            <h1 className="font-headline-xl text-headline-xl mt-2 text-ink font-bold">Secure Sharing</h1>
          </div>
        </div>

        <section className="mb-10 border border-surface-dim bg-surface-container-lowest p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-headline-md text-headline-md text-ink">Shared with me</h3>
            <span className="text-sm uppercase tracking-[0.14em] text-on-surface-variant font-bold">{sharedInboxItems.length} item{sharedInboxItems.length === 1 ? '' : 's'}</span>
          </div>

          {sharedInboxLoading && <p className="text-base text-on-surface-variant">Loading shared items...</p>}
          {sharedInboxError && <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-base">{sharedInboxError}</div>}

          {!sharedInboxLoading && sharedInboxItems.length === 0 && (
            <p className="text-base text-on-surface-variant">No shared credentials yet.</p>
          )}

          {!sharedInboxLoading && sharedInboxItems.length > 0 && (
            <div className="space-y-3">
              {sharedInboxItems.map((item) => {
                const openedShare = openedShares[item.share_id]

                return (
                  <div key={item.share_id} className="rounded-md border border-surface-dim bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="rounded-md bg-surface-container-lowest p-4 space-y-3 flex-1 w-full">
                        <p className="text-lg font-bold text-ink">Site: {openedShare?.site ?? 'Unavailable'}</p>
                        <p className="text-base text-on-surface-variant">Username: {openedShare?.username ?? 'Unavailable'}</p>
                        <p className="text-base text-on-surface-variant break-all">Password: {openedShare?.password ?? 'Unavailable'}</p>
                      </div>
                      <button
                        type="button"
                        className="vault-btn-secondary px-4 py-2 text-base disabled:opacity-50 disabled:cursor-not-allowed self-end md:self-center"
                        onClick={() => handleDeleteSharedItem(item.share_id)}
                        disabled={deletingShareId === item.share_id}
                      >
                        {deletingShareId === item.share_id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {openShareError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-base">{openShareError}</div>}
          {deleteShareError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-base">{deleteShareError}</div>}
        </section>

        <section className="border border-surface-dim bg-surface-container-lowest p-6 rounded-lg shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
            <div className="max-w-2xl">
              <h3 className="font-headline-md text-headline-md text-ink">Share Credentials</h3>
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

          {sharingSetupError && <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{sharingSetupError}</div>}
          {sharingSetupMessage && <div className="mb-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{sharingSetupMessage}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 text-sm font-bold text-ink" htmlFor="share-recipient-email">Recipient email</label>
              <input
                id="share-recipient-email"
                type="email"
                value={shareRecipientEmail}
                onChange={(event) => setShareRecipientEmail(event.target.value)}
                className="input-line w-full py-2"
                placeholder="recipient@example.com"
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-bold text-ink mb-3">Select credential</p>
            <div className="max-h-72 overflow-auto border border-surface-dim rounded-md bg-white divide-y divide-surface-dim">
              {orderedEntries.length === 0 && (
                <div className="px-4 py-6 text-sm text-on-surface-variant">No credentials available to share.</div>
              )}
              {orderedEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`w-full text-left px-4 py-3 transition-colors ${shareTargetId === entry.id ? 'bg-mint/25' : 'hover:bg-surface-container-low'}`}
                  onClick={() => setShareTargetId(entry.id)}
                >
                  <p className="font-bold text-ink">{entry.site}</p>
                  <p className="text-sm text-on-surface-variant">{entry.username}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 items-center">
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
            <span className="text-sm text-on-surface-variant">
              {selectedShareEntry ? `Selected: ${selectedShareEntry.site} / ${selectedShareEntry.username}` : 'No credential selected'}
            </span>
          </div>

          {shareError && <div className="mt-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{shareError}</div>}
          {shareStatus && <div className="mt-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">{shareStatus}</div>}
        </section>
      </main>
    </div>
  )
}

export default VaultSharingPage
