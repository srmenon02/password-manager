import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import { checkPasswordBreach } from '@/services/api'

function VaultBreachPage() {
  const navigate = useNavigate()
  const { vaultData, isUnlocked, clearVaultSession } = useVault()

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  const [breachedEntryIds, setBreachedEntryIds] = useState<Set<string>>(new Set())
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

  useEffect(() => {
    const localToken = localStorage.getItem('vaultkey_token')
    if (!localToken) {
      navigate('/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!vaultData || !isUnlocked) {
      setBreachedEntryIds(new Set())
      return
    }

    const entries = vaultData.entries

    let cancelled = false

    async function scanEntries() {
      setLoading(true)

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
        setLoading(false)
      }
    }

    void scanEntries()

    return () => {
      cancelled = true
    }
  }, [vaultData, isUnlocked])

  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-6">
        <div className="max-w-2xl mx-auto bg-surface-container-low rounded-lg shadow-xl p-8 text-center border border-surface-dim">
          <h1 className="text-2xl font-bold text-ink mb-3">Vault Locked</h1>
          <p className="text-on-surface-variant mb-6">Sign in to review breached credentials.</p>
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
          <Link to="/vault/activity" className="text-on-surface-variant hover:text-pink transition-colors duration-200">Activity</Link>
          <span className="text-ink border-b border-ink">Breach</span>
        </nav>
        <div className="flex gap-4 items-center">
          <button className="vault-btn-primary px-4 py-2 font-body-md font-bold" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      <main className="flex-grow flex flex-col pt-10 px-margin-safe pb-24">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="font-headline-xl text-headline-xl mt-2 text-ink font-bold">Breach dashboard</h1>
          </div>
        </div>

        {loading && <p className="mb-6 text-sm text-on-surface-variant">Scanning credentials against breach data...</p>}

        {!loading && breachedEntries.length === 0 && (
          <div className="border border-red-200 bg-red-50 p-6 rounded-lg shadow-sm">
            <p className="text-sm text-red-700">No breached credentials detected in this vault.</p>
          </div>
        )}

        {!loading && breachedEntries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        )}
      </main>
    </div>
  )
}

export default VaultBreachPage
