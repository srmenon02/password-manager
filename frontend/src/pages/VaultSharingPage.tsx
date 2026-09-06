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
import { usePageMeta } from '@/hooks/usePageMeta'

function VaultSharingPage() {
  usePageMeta('Sharing · VaultKey', 'Securely share credentials with end-to-end encrypted item sharing.')
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
      <header className="w-full min-h-16 py-2 bg-paper flex flex-wrap gap-x-4 gap-y-2 justify-between items-center px-gutter max-w-full z-50 sticky top-0 border-b border-surface-dim">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">VaultKey</Link>
        <nav className="flex flex-wrap gap-x-5 gap-y-1 md:gap-8 items-center font-body-md text-body-md">
          <Link to="/vault" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Vault</Link>
          <button onClick={() => navigate('/generator')} className="text-on-surface-variant font-body-md cursor-pointer hover:text-primary transition-colors duration-200">Generator</button>
          <span className="text-ink border-b border-ink">Sharing</span>
          <Link to="/vault/activity" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Activity</Link>
          <Link to="/vault/breach" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Breach</Link>
        </nav>
        <div className="flex gap-4 items-center">
          <button type="button" onClick={handleLogout} className="text-on-surface-variant hover:text-primary transition-colors duration-200">Log Out</button>
        </div>
      </header>

      <main className="flex-grow px-margin-safe py-12 md:py-hero-offset max-w-7xl mx-auto w-full">
        <section className="mb-16 md:ml-[15%]">
          <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink mb-8">Credentials</h1>
        </section>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-16">
          <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between"><h2 className="font-headline-md text-headline-md text-ink">Shared with me</h2><span className="font-label-caps text-label-caps text-on-surface-variant">{sharedInboxItems.length} ITEMS</span></div>
            {sharedInboxLoading && <p className="text-on-surface-variant">Loading shared items...</p>}
            {sharedInboxError && <p className="border border-error bg-error-container p-4 text-on-error-container">{sharedInboxError}</p>}
            {!sharedInboxLoading && sharedInboxItems.length === 0 && <p className="border border-taupe bg-surface-container-low p-6 text-on-surface-variant">No shared credentials yet.</p>}
            {sharedInboxItems.map((item) => {
              const openedShare = openedShares[item.share_id]
              return <article key={item.share_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 p-6 bg-surface-container-low border border-ink">
                <div><h3 className="font-body-lg text-body-lg text-ink">{openedShare?.site ?? 'Unavailable'}</h3><p className="text-on-surface-variant">{openedShare?.username ?? 'Unavailable'}</p><p className="font-mono text-sm break-all text-on-surface-variant">{openedShare?.password ?? 'Unavailable'}</p></div>
                <button type="button" className="vault-btn-secondary px-5 py-2 disabled:opacity-50" onClick={() => handleDeleteSharedItem(item.share_id)} disabled={deletingShareId === item.share_id}>{deletingShareId === item.share_id ? 'Deleting...' : 'Delete'}</button>
              </article>
            })}
            {openShareError && <p className="border border-error bg-error-container p-4 text-on-error-container">{openShareError}</p>}
            {deleteShareError && <p className="border border-error bg-error-container p-4 text-on-error-container">{deleteShareError}</p>}
          </section>

          <aside className="lg:col-span-5 xl:col-span-4 h-fit mt-12 lg:mt-0 bg-white p-8 border border-ink shadow-[8px_8px_0_0_#190922]">
            <h2 className="font-headline-md text-headline-md text-ink mb-4">Share Access</h2>
            <p className="text-on-surface-variant mb-8">Securely grant access to a credential.</p>
            <button type="button" className="shine-button w-full px-4 py-3 mb-8 disabled:opacity-50" onClick={handleSetupSharingKeys} disabled={sharingSetupLoading}>{sharingSetupLoading ? 'Generating...' : 'Generate Sharing Keys'}</button>
            {sharingSetupError && <p className="mb-4 border border-error bg-error-container p-3 text-on-error-container">{sharingSetupError}</p>}
            {sharingSetupMessage && <p className="mb-4 text-on-surface-variant">{sharingSetupMessage}</p>}
            <div className="flex flex-col gap-8">
              <div><label className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block" htmlFor="share-target">Select Credential</label><select id="share-target" value={shareTargetId ?? ''} onChange={(event) => setShareTargetId(event.target.value || null)} className="input-line w-full py-2 bg-transparent text-ink"><option value="">Select a credential</option>{orderedEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.site} / {entry.username}</option>)}</select></div>
              <div><label className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block" htmlFor="share-recipient-email">Recipient Email</label><input id="share-recipient-email" type="email" value={shareRecipientEmail} onChange={(event) => setShareRecipientEmail(event.target.value)} className="input-line w-full py-2 bg-transparent text-ink" placeholder="colleague@example.com" /></div>
              <button type="button" className="shine-button w-full py-4 disabled:opacity-50" onClick={handleShareSelectedEntry} disabled={shareLoading || !selectedShareEntry}>{shareLoading ? 'Sharing...' : 'Share Credential'}</button>
              {shareTargetId && <button type="button" className="text-on-surface-variant hover:text-primary" onClick={() => setShareTargetId(null)}>Clear selection</button>}
              {shareError && <p className="border border-error bg-error-container p-3 text-on-error-container">{shareError}</p>}
              {shareStatus && <p className="border border-primary bg-mint/30 p-3 text-ink">{shareStatus}</p>}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default VaultSharingPage
