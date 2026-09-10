import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import { checkPasswordBreach, saveBreachResults } from '@/services/api'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'
import { VAULT_NAV } from '@/components/navItems'
import {
  headerAction,
  primaryAction,
} from '@/components/controlStyles'

function VaultBreachPage() {
  usePageMeta('Breach Monitor · cipher', 'Check your stored passwords against known data breaches.')
  const navigate = useNavigate()
  const { vaultData, token, isUnlocked, clearVaultSession } = useVault()

  function handleLogout() {
    // Scoped to this app's keys — localStorage.clear() would also wipe unrelated
    // data stored on this origin.
    localStorage.removeItem('cipher_token')
    clearVaultSession()
    navigate('/')
  }

  const [breachedEntryIds, setBreachedEntryIds] = useState<Set<string>>(new Set())
  const [uncheckedCount, setUncheckedCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const orderedEntries = useMemo(() => {
    if (!vaultData) {
      return []
    }

    return [...vaultData.entries].sort((a, b) =>
      a.site.localeCompare(b.site, undefined, { sensitivity: 'base' })
    )
  }, [vaultData])

  const breachedEntries = useMemo(
    () => orderedEntries.filter((entry) => breachedEntryIds.has(entry.id)),
    [orderedEntries, breachedEntryIds]
  )

  const checkedCount = orderedEntries.length - uncheckedCount

  useEffect(() => {
    const localToken = localStorage.getItem('cipher_token')
    if (!localToken) {
      navigate('/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!vaultData || !isUnlocked) {
      return
    }

    const entries = vaultData.entries

    let cancelled = false

    async function scanEntries() {
      setLoading(true)

      // null means the lookup itself failed. Collapsing that to `false` would report an
      // unreachable breach API as a clean bill of health, and persist that to the server.
      const results = await Promise.all(
        entries.map(async (entry) => {
          try {
            const breached = await checkPasswordBreach(entry.password)
            return [entry.id, breached] as const
          } catch {
            return [entry.id, null] as const
          }
        })
      )

      if (!cancelled) {
        setBreachedEntryIds(new Set(results.filter(([, breached]) => breached === true).map(([id]) => id)))
        setUncheckedCount(results.filter(([, breached]) => breached === null).length)

        const checked = results.filter(
          (result): result is readonly [string, boolean] => result[1] !== null
        )
        if (token && checked.length > 0) {
          try {
            await saveBreachResults(
              token,
              checked.map(([entryId, breached]) => ({ entry_id: entryId, breached }))
            )
          } catch {
            // Persisting the scan is best-effort; the on-screen result is still valid.
          }
        }
        setLoading(false)
      }
    }

    void scanEntries()

    return () => {
      cancelled = true
    }
  }, [vaultData, isUnlocked, token])

  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex flex-col bg-paper selection:bg-mint selection:text-ink">
        <AppHeader />
        <div className="flex-grow flex items-center justify-center px-gutter py-16">
          <div className="w-full max-w-md bg-surface-container-lowest border-2 border-ink p-8 text-center shadow-[8px_8px_0px_0px_theme(colors.ink)]">
            <h1 className="font-headline-md text-headline-md text-ink mb-3">Vault locked</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Your vault is encrypted. Sign in with your master password to review breached credentials.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className={`${primaryAction} w-full`}
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col font-body-md text-body-md bg-paper text-ink">
      <AppHeader
        nav={VAULT_NAV}
        navLabel="Vault sections"
        action={
          <button
            type="button"
            onClick={handleLogout}
            className={headerAction}
          >
            Log Out
          </button>
        }
      />

      <main className="flex-grow w-full max-w-7xl mx-auto px-margin-safe py-16 md:py-hero-offset flex flex-col md:flex-row gap-gutter">
        <section className="md:w-1/3 flex flex-col gap-6">
          <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink">Breach Alerts</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">Known breached passwords.</p>
          <p aria-live="polite" className="text-on-surface-variant">
            {loading
              ? 'Scanning credentials against breach data…'
              : `${checkedCount} of ${orderedEntries.length} credential${
                  orderedEntries.length === 1 ? '' : 's'
                } checked.`}
          </p>
        </section>

        <section className="md:w-2/3 flex flex-col gap-8 mt-12 md:mt-0">
          {!loading && uncheckedCount > 0 && (
            <div role="alert" className="border-2 border-error bg-error-container p-8 text-on-error-container">
              {uncheckedCount} of {orderedEntries.length} credential
              {orderedEntries.length === 1 ? '' : 's'} could not be checked — the breach database
              was unreachable. Those passwords have not been cleared.
            </div>
          )}
          {!loading && orderedEntries.length === 0 && (
            <div className="border-2 border-dashed border-ink/30 bg-surface-container-lowest px-6 py-12 text-center text-on-surface-variant">
              Your vault is empty, so there is nothing to check yet.
            </div>
          )}
          {/* "All clear" is only honest when every credential actually came back from HIBP. */}
          {!loading && orderedEntries.length > 0 && breachedEntries.length === 0 && uncheckedCount === 0 && (
            <div className="bg-sage p-8 border-2 border-ink">
              <p className="text-ink">No breached credentials detected in this vault.</p>
            </div>
          )}
          {!loading && breachedEntries.map((entry) => (
            <article key={entry.id} className="bg-surface-container-low p-8 border-2 border-ink">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="min-w-0">
                  {/* min-w-0 on the nested flex too: without it the row keeps min-width:auto
                      and a long site name pushes the whole page wider than the viewport. */}
                  <div className="flex flex-wrap items-center gap-3 mb-2 min-w-0">
                    {/* overflow-wrap:anywhere, not break-words: only `anywhere` shrinks the
                        element's min-content size, which is what an unbroken domain widens. */}
                    <h2 className="font-headline-md text-headline-md text-ink min-w-0 [overflow-wrap:anywhere]">{entry.site}</h2>
                    {/* Same treatment as the vault list's breach badge, rather than a pink pill. */}
                    <span className="inline-flex items-center gap-1.5 border border-error bg-error-container px-2 py-1 font-label-caps text-label-caps uppercase text-on-error-container font-bold">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">warning</span>
                      Exposed
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant [overflow-wrap:anywhere]">{entry.username}</p>
                  <p className="text-sm text-on-surface-variant mt-1">Password appears in known breach data</p>
                </div>
                <button
                  type="button"
                  className={`${primaryAction} shrink-0`}
                  aria-label={`Change password for ${entry.site}`}
                  onClick={() => navigate('/vault', { state: { editEntryId: entry.id } })}
                >
                  Change Password
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}

export default VaultBreachPage
