import { loginInit, loginVerify, getVault } from '@/services/api'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { generateEphemeralA, bytesToHex, base64ToBytes, hexToBytes, bytesToBase64 } from '@/crypto/srp'
import srp from 'secure-remote-password/client'
import { deriveKey } from '@/crypto/keyDerivation'
import { unwrapKey } from '@/crypto/keyWrapping'
import { decryptVault, base64ToArrayBuffer } from '@/crypto/vaultEncryption'
import { useVault } from '@/context/VaultContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { setVaultSession } = useVault()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { a, A } = generateEphemeralA()
      const loginResponse = await loginInit({ email, client_ephemeral_a: A })
      const { session_id, salt, server_ephemeral_b } = loginResponse

      const saltBytes = new Uint8Array(base64ToArrayBuffer(salt))
      const saltHex = bytesToHex(saltBytes)
      const serverBHex = bytesToHex(new Uint8Array(base64ToArrayBuffer(server_ephemeral_b)))

      const privateKey = srp.derivePrivateKey(saltHex, email, password)
      const aHex = bytesToHex(base64ToBytes(a))
      const AHex = bytesToHex(base64ToBytes(A))

      const clientSession = srp.deriveSession(aHex, serverBHex, saltHex, email, privateKey)
      const clientProofM1 = bytesToBase64(hexToBytes(clientSession.proof))

      const verifyResponse = await loginVerify({
        session_id,
        client_proof_m1: clientProofM1,
      })

      srp.verifySession(AHex, clientSession, bytesToHex(base64ToBytes(verifyResponse.server_proof_m2)))

      localStorage.setItem('vaultkey_token', verifyResponse.token)

      const vaultResponse = await getVault(verifyResponse.token)
      const masterKey = await deriveKey(password, saltBytes)
      const vaultKey = await unwrapKey(
        vaultResponse.protected_key,
        masterKey,
        vaultResponse.protected_key_iv
      )

      const vaultData = await decryptVault(
        { ciphertext: vaultResponse.encrypted_blob, iv: vaultResponse.vault_iv },
        vaultKey
      )

      setVaultSession({
        vaultData,
        vaultKey,
        token: verifyResponse.token,
      })
      navigate('/vault')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col font-body-md overflow-x-hidden bg-paper text-ink">
      <header className="w-full h-16 bg-paper flex justify-between items-center px-gutter max-w-full z-50 fixed top-0">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">VaultKey</Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/vault" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Vault</Link>
          <Link to="/generator" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Generator</Link>
          <div className="flex items-center gap-4 ml-4">
            <Link to="/register" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Create Login</Link>
          </div>
        </nav>
      </header>

      <main className="flex-grow flex flex-col mt-16 px-margin-safe py-hero-offset md:py-32 items-center">
        <div className="w-full flex flex-col items-center text-center bg-surface-container-low text-ink p-8 md:p-12 rounded-3xl shadow-2xl">
          <h1 className="font-headline-xl text-headline-xl-mobile md:text-headline-xl mb-8">Access Vault</h1>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md w-full max-w-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-8 w-full max-w-md">
            <div className="flex flex-col items-center group border-b border-outline-variant focus-within:border-pink transition-colors duration-200 pb-2 w-full">
              <label className="font-label-caps text-label-caps text-on-surface-variant mb-2" htmlFor="email">Email Identity</label>
              <input
                className="bg-transparent border-none p-0 font-body-lg text-body-lg text-center focus:ring-0 placeholder-outline text-ink w-full"
                id="email"
                placeholder="name@domain.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                required
              />
            </div>

            <div className="flex flex-col items-center group border-b border-outline-variant focus-within:border-pink transition-colors duration-200 pb-2 relative w-full">
              <label className="font-label-caps text-label-caps text-on-surface-variant mb-2" htmlFor="master_password">Master Key</label>
              <input
                className="bg-transparent border-none p-0 font-body-lg text-body-lg text-center focus:ring-0 placeholder-outline text-ink w-full"
                id="master_password"
                placeholder="************"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
              />
              <button
                className="absolute right-0 bottom-2 text-on-surface-variant hover:text-ink transition-colors"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined">visibility</span>
              </button>
            </div>

            <div className="flex justify-center items-center mt-4">
              <button type="button" className="font-body-md text-body-md text-on-surface-variant hover:text-pink transition-colors border-b border-transparent hover:border-pink">
                Lost key?
              </button>
            </div>

            <button className="relative group p-[2px] rounded-full hover:scale-105 active:scale-100 transition-transform duration-200 mt-8 w-full cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" type="submit" disabled={loading}>
              <div className="absolute inset-0 rounded-full login-button-bg"></div>
              <div className="relative bg-ink w-full py-4 rounded-full flex items-center justify-center h-full">
                <span className="text-mint font-label-caps text-label-caps tracking-widest uppercase">{loading ? 'Unlocking...' : 'Unlock'}</span>
              </div>
            </button>
          </form>
        </div>

        <div className="w-full md:w-7/12 flex items-center justify-center md:items-start md:justify-start relative">
          <div className="flex flex-col gap-8 max-w-lg">
          </div>
        </div>
      </main>
    </div>
  )
}
