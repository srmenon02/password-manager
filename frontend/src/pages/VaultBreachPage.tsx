import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import { checkPasswordBreach, saveBreachResults } from '@/services/api'

async function getPasswordSha1(password: string) {
  const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function VaultBreachPage() {
  const navigate = useNavigate()
  const { vaultData, token, isUnlocked, clearVaultSession } = useVault()

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
        if (token) {
          try {
            await saveBreachResults(token, await Promise.all(entries.map(async (entry, index) => ({
              entry_id: entry.id,
              password_sha1: await getPasswordSha1(entry.password),
              breached: results[index][1],
            }))))
          } catch {}
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

      <main className="flex-grow w-full max-w-7xl mx-auto px-margin-safe py-hero-offset flex flex-col md:flex-row gap-gutter">
        <section className="md:w-1/3 flex flex-col gap-6">
          <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink">Breach Alerts</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">Known breached passwords.</p>
          {loading && <p className="text-on-surface-variant">Scanning credentials against breach data...</p>}
        </section>

        <section className="md:w-2/3 flex flex-col gap-8 mt-12 md:mt-0">
          {!loading && breachedEntries.length === 0 && <div className="bg-sage p-8 border border-ink"><p className="text-on-surface-variant">No breached credentials detected in this vault.</p></div>}
          {!loading && breachedEntries.map((entry) => (
            <article key={entry.id} className="bg-surface-container-low p-8 border border-ink relative overflow-hidden hover:bg-surface-container-high transition-colors duration-300">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h2 className="font-headline-md text-headline-md text-ink">{entry.site}</h2>
                    <span className="bg-blush text-ink font-label-caps text-label-caps px-3 py-1 rounded-full uppercase tracking-wider">Exposed</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant font-mono">{entry.username}</p>
                  <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-1">Password appears in known breach data</p>
                </div>
                <button type="button" className="shine-button px-6 py-3 uppercase" onClick={() => navigate('/vault')}>Change Password</button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}

export default VaultBreachPage
