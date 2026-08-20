import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AuditLogEntry, AuditLogVerifyResponse } from '@shared/types'
import { getAuditLog, verifyAuditLog } from '@/services/api'
import { useVault } from '@/context/VaultContext'

function formatAuditAction(action: string) {
  return action
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function shouldRenderAuditMetadataField(key: string) {
  return ![
    'algorithm',
    'method',
    'from_user_id',
    'encrypted_blob_bytes',
    'item_id',
    'permission',
    'share_id',
    'to_user_id',
  ].includes(key)
}

function getDisplayMetadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .filter(([key]) => shouldRenderAuditMetadataField(key))
    .map(([key, value]) => {
      if (key === 'from_user_email') {
        return ['from_user', value] as const
      }
      return [key, value] as const
    })
}

function VaultActivityPage() {
  const navigate = useNavigate()
  const { token, isUnlocked, clearVaultSession } = useVault()

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditVerifyResult, setAuditVerifyResult] = useState<AuditLogVerifyResponse | null>(null)
  const [auditVerifyLoading, setAuditVerifyLoading] = useState(false)

  useEffect(() => {
    const localToken = localStorage.getItem('vaultkey_token')
    if (!localToken) {
      navigate('/login')
    }
  }, [navigate])

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

  useEffect(() => {
    if (!token || !isUnlocked) {
      setAuditEntries([])
      setAuditVerifyResult(null)
      return
    }

    void refreshAuditLog()
  }, [token, isUnlocked])

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

  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-6">
        <div className="max-w-2xl mx-auto bg-surface-container-low rounded-lg shadow-xl p-8 text-center border border-surface-dim">
          <h1 className="text-2xl font-bold text-ink mb-3">Vault Locked</h1>
          <p className="text-on-surface-variant mb-6">Sign in to inspect your activity chain.</p>
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
          <Link to="/vault/sharing" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Sharing</Link>
          <span className="text-ink border-b border-ink">Activity</span>
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
            <h1 className="font-headline-xl text-headline-xl mt-2 text-ink font-bold">Tamper-Evident Activity Chain</h1>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="vault-btn-secondary px-4 py-2 font-body-md whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleVerifyAuditLog}
              disabled={auditVerifyLoading || auditLoading}
            >
              {auditVerifyLoading ? 'Verifying...' : 'Verify chain integrity'}
            </button>
          </div>
        </div>

        {auditVerifyResult && (
          <div className={`mb-6 p-3 rounded-md border text-sm ${auditVerifyResult.is_valid ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {auditVerifyResult.is_valid
              ? `Chain valid across ${auditVerifyResult.checked_entries} entries`
              : `Chain invalid at entry ${auditVerifyResult.broken_entry_id ?? 'unknown'}`}
          </div>
        )}

        {auditError && <div className="mb-6 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{auditError}</div>}
        {auditLoading && <p className="mb-6 text-sm text-on-surface-variant">Loading audit log...</p>}

        {!auditLoading && auditEntries.length === 0 && (
          <div className="border border-surface-dim bg-surface-container-lowest p-6 rounded-lg shadow-sm">
            <p className="text-sm text-on-surface-variant">No audit entries yet.</p>
          </div>
        )}

        {!auditLoading && auditEntries.length > 0 && (
          <div className="space-y-3">
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

                {getDisplayMetadataEntries(entry.metadata).length > 0 && (
                  <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-on-surface-variant">
                    {getDisplayMetadataEntries(entry.metadata)
                      .map(([key, value]) => (
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
      </main>
    </div>
  )
}

export default VaultActivityPage
