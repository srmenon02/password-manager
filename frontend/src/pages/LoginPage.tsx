import { loginInit, loginVerify, getVault } from '@/services/api'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { generateEphemeralA, bytesToHex, base64ToBytes, hexToBytes, bytesToBase64 } from '@/crypto/srp'
import srp from 'secure-remote-password/client'
import { deriveKey } from '@/crypto/keyDerivation'
import { unwrapKey } from '@/crypto/keyWrapping'
import { decryptVault, base64ToArrayBuffer } from '@/crypto/vaultEncryption'
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // ============================================================
      // TODO (YOU IMPLEMENT): SRP Login Flow
      // ============================================================
      // This is the CORE crypto work - you must understand this!
      //
      // Steps:
      // 1. Call loginInit() with email + ephemeral A
      // 2. Receive: session_id, salt, server's ephemeral B
      // 3. Calculate SRP shared secret and proof M1
      // 4. Call loginVerify() with session_id + M1
      // 5. Verify server's M2 proof
      // 6. Store JWT token
      // 7. Unlock vault (derive key, unwrap, decrypt)
      // 8. Navigate to /vault
      //
      // For now, this is a placeholder
      // ============================================================
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
      console.log('client K:', clientSession.key)
      console.log('client M1:', clientSession.proof)
      console.log('email used:', email)
      const clientProofM1 = bytesToBase64(hexToBytes(clientSession.proof))

      const verifyResponse = await loginVerify({
        session_id,
        client_proof_m1: clientProofM1
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

      console.log('Vault unlocked:', vaultData)
      navigate('/vault')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome Back
            </h1>
            <p className="text-gray-600">
              Unlock your vault with your master password
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="you@example.com"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Master Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                placeholder="Your master password"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Unlocking...
                </span>
              ) : (
                'Unlock Vault'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Create one
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              to="/"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
