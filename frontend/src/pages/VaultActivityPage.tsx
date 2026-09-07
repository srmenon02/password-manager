import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AuditLogEntry, AuditLogVerifyResponse } from '@shared/types'
import { getAuditLog, verifyAuditLog } from '@/services/api'
import { useVault } from '@/context/VaultContext'
import { usePageMeta } from '@/hooks/usePageMeta'

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
  usePageMeta('Activity · VaultKey', 'Review your hash-chained audit log and verify its integrity.')
  const navigate = useNavigate()
  const { token, isUnlocked, clearVaultSession } = useVault()

  function handleLogout() {
    // Scoped to this app's keys — localStorage.clear() would also wipe unrelated
    // data stored on this origin.
    localStorage.removeItem('vaultkey_token')
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
      return
    }

    // Fetch-on-mount sets its loading flag before the first await, which this rule counts
    // as a synchronous effect setState. Satisfying it properly means moving data fetching
    // into React Query or a shared useAsync hook app-wide; tracked separately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAuditLog()
    // refreshAuditLog is redefined every render, so listing it here would re-fetch the log
    // on each one. The effect only needs to re-run when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="min-h-screen flex items-center justify-center bg-paper px-gutter selection:bg-mint selection:text-ink">
        <div className="w-full max-w-md bg-surface-container-lowest border-2 border-ink p-8 text-center shadow-[8px_8px_0px_0px_theme(colors.ink)]">
          <h1 className="font-headline-md text-headline-md text-ink mb-3">Vault locked</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mb-8">
            Your vault is encrypted. Sign in with your master password to inspect your activity chain.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="vault-btn-primary w-full min-h-11 px-4 font-body-md text-body-md font-bold"
          >
            Go to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md bg-paper text-ink">
      <header className="w-full min-h-16 py-2 bg-paper flex flex-wrap gap-x-4 gap-y-2 justify-between items-center px-gutter max-w-full z-50 sticky top-0 border-b border-surface-dim">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">VaultKey</Link>
        <nav aria-label="Vault sections" className="flex flex-wrap gap-x-5 gap-y-1 md:gap-8 items-center font-body-md text-body-md">
          <Link to="/vault" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Vault</Link>
          <Link to="/generator" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Generator</Link>
          <Link to="/vault/sharing" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Sharing</Link>
          <span aria-current="page" className="text-ink border-b border-ink">Activity</span>
          <Link to="/vault/breach" className="text-on-surface-variant hover:text-primary transition-colors duration-200">Breach</Link>
        </nav>
        <div className="flex gap-4 items-center">
          <button type="button" onClick={handleLogout} className="text-on-surface-variant hover:text-primary transition-colors duration-200">Log Out</button>
        </div>
      </header>

      <main className="w-full px-margin-safe py-16 md:py-hero-offset max-w-7xl mx-auto flex flex-col gap-16">
        <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 pl-0 md:pl-[15%]">
          <div className="flex flex-col gap-4">
            <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink">Audit Log</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md">Secure, hash-chained timeline.</p>
          </div>
          <button type="button" className="shine-button px-6 py-4 uppercase w-full md:w-auto disabled:opacity-50" onClick={handleVerifyAuditLog} disabled={auditVerifyLoading || auditLoading}>
            {auditVerifyLoading ? 'Verifying…' : 'Verify Chain Integrity'}
          </button>
        </section>

        <section className="pl-0 md:pl-[15%] w-full max-w-4xl">
          {auditVerifyResult && (
            <div
              role="status"
              className={`mb-6 border-2 p-4 ${
                auditVerifyResult.is_valid
                  ? 'border-ink bg-mint text-ink'
                  : 'border-error bg-error-container text-on-error-container'
              }`}
            >
              {auditVerifyResult.is_valid
                ? `Chain valid across ${auditVerifyResult.checked_entries} ${
                    auditVerifyResult.checked_entries === 1 ? 'entry' : 'entries'
                  }`
                : `Chain invalid at entry ${auditVerifyResult.broken_entry_id ?? 'unknown'}`}
            </div>
          )}
          {auditError && (
            <div role="alert" className="mb-6 border-2 border-error bg-error-container p-4 text-on-error-container">
              {auditError}
            </div>
          )}
          {auditLoading && <p className="text-on-surface-variant">Loading audit log…</p>}
          {!auditLoading && !auditError && auditEntries.length === 0 && (
            <p className="border-2 border-dashed border-ink/30 bg-surface-container-lowest px-6 py-12 text-center text-on-surface-variant">
              No activity recorded yet.
            </p>
          )}
          <ul className="flex flex-col relative empty:hidden pb-8">
            {auditEntries.map((entry, index) => (
              <li key={entry.id} className="relative pl-12 py-6 border-t border-taupe">
                {/* left-[21px] centres the 2px rule under the 12px dot at left-4. */}
                {/* -bottom-8 carries the rule across the row gap to the next dot: on a page
                    about a hash chain, a connector broken between entries is the wrong picture. */}
                {index < auditEntries.length - 1 && <div aria-hidden="true" className="absolute left-[21px] top-10 -bottom-8 border-l-2 border-dashed border-taupe"></div>}
                {/* One colour for every entry: cycling mint/sage/blush by index read as a
                    severity signal on a page about integrity, while encoding nothing. */}
                <div aria-hidden="true" className="absolute left-4 top-8 w-3 h-3 border border-ink rounded-full bg-mint"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="font-body-lg text-body-lg text-ink mb-1">{formatAuditAction(entry.action)}</h2>
                    <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">{new Date(entry.occurred_at).toLocaleString()}</p>
                  </div>
                  <span
                    title={entry.entry_hash}
                    className="shrink-0 bg-surface-container px-3 py-1 border border-taupe text-xs font-mono text-tertiary"
                  >
                    SHA-256: {entry.entry_hash.slice(0, 12)}…
                  </span>
                </div>
                {getDisplayMetadataEntries(entry.metadata).length > 0 && <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-on-surface-variant">{getDisplayMetadataEntries(entry.metadata).map(([key, value]) => <div key={key} className="border border-taupe px-3 py-2"><dt className="text-ink">{formatAuditAction(key)}</dt><dd className="break-all">{String(value)}</dd></div>)}</dl>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default VaultActivityPage
