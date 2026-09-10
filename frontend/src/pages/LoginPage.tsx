import { loginInit, loginVerify, getVault } from '@/services/api'
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateEphemeralA, bytesToHex, base64ToBytes, hexToBytes, bytesToBase64 } from '@/crypto/srp'
import srp from 'secure-remote-password/client'
import { deriveKey } from '@/crypto/keyDerivation'
import { unwrapKey } from '@/crypto/keyWrapping'
import { decryptVault, base64ToArrayBuffer } from '@/crypto/vaultEncryption'
import { useVault } from '@/context/VaultContext'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'
import {
  heroAction,
  heroLabel,
  inlineTextAction,
} from '@/components/controlStyles'

export default function LoginPage() {
  usePageMeta(
    'Log In · cipher',
    'Securely log in to your cipher vault using SRP authentication — your password is never sent to the server.'
  )
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

      localStorage.setItem('cipher_token', verifyResponse.token)

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
      <AppHeader
        nav={[
          { label: 'Vault', to: '/vault' },
          { label: 'Generator', to: '/generator' },
          { label: 'Create Login', to: '/register' },
        ]}
      />

      <main className="flex-grow flex flex-col px-margin-safe py-hero-offset md:py-32 items-center">
        <div className="w-full flex flex-col items-center text-center bg-surface-container-low text-ink p-8 md:p-12 rounded-3xl shadow-2xl">
          <h1 className="font-headline-xl text-headline-xl-mobile md:text-headline-xl mb-8">Access Vault</h1>

          {error && (
            <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md w-full max-w-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-8 w-full max-w-md">
            <div className="flex flex-col items-center group border-b border-outline-variant focus-within:border-primary transition-colors duration-200 pb-2 w-full">
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

            <div className="flex flex-col items-center group border-b border-outline-variant focus-within:border-primary transition-colors duration-200 pb-2 relative w-full">
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
                className={`${inlineTextAction} absolute right-0 bottom-0`}
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>

            <button type="submit" disabled={loading} className={`${heroAction} mt-8 w-full`}>
              <span className={heroLabel}>{loading ? 'Unlocking…' : 'Unlock'}</span>
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
