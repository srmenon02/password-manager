import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { generateSalt, deriveKey } from '@/crypto/keyDerivation'
import { generateSRPVerifier } from '@/crypto/srp'
import { arrayBufferToBase64, encryptVault } from '@/crypto/vaultEncryption'
import type { RegisterRequest, VaultData } from '@shared/types'
import { wrapKey } from '@/crypto/keyWrapping'
import { registerUser } from '@/services/api'
import { useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import { createEmptyVault } from '@/models/vault'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })
  const navigate = useNavigate()
  const { setVaultSession } = useVault()
  function validateForm(): boolean {
    const errors = {
      email: '',
      password: '',
      confirmPassword: '',
    }

    if (!email) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address'
    }

    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 12) {
      errors.password = 'Password must be at least 12 characters'
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    setValidationErrors(errors)
    return !errors.email && !errors.password && !errors.confirmPassword
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const salt = generateSalt();

      const masterKey = await deriveKey(password, salt);

      const authVerifier = await generateSRPVerifier(email, password, salt);

      const vaultKey = await crypto.subtle.generateKey(
        {name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      const { protectedKey, iv: protectedKeyIv } = await wrapKey(vaultKey, masterKey);

      const emptyVault: VaultData = createEmptyVault()

      const { ciphertext: encryptedBlob, iv: vaultIv } =
          await encryptVault(emptyVault, vaultKey);

      const registerData: RegisterRequest = {
        email,
        salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
        auth_verifier: authVerifier,
        protected_key: protectedKey,
        protected_key_iv: protectedKeyIv,
        encrypted_blob: encryptedBlob,
        vault_iv: vaultIv
      }
      
      const response = await registerUser(registerData);

      localStorage.setItem('vaultkey_token', response.token)

      setVaultSession({
        vaultData: emptyVault,
        vaultKey,
        token: response.token,
      })

      navigate('/vault');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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
              Create Account
            </h1>
            <p className="text-gray-600">
              Start securing your passwords with VaultKey
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
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  validationErrors.email
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
                placeholder="you@example.com"
                disabled={loading}
              />
              {validationErrors.email && (
                <p className="mt-1 text-sm text-red-600">
                  {validationErrors.email}
                </p>
              )}
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
                minLength={12}
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  validationErrors.password
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
                placeholder="At least 12 characters"
                disabled={loading}
              />
              {validationErrors.password && (
                <p className="mt-1 text-sm text-red-600">
                  {validationErrors.password}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                This password encrypts your vault. Choose a strong, unique password.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                  validationErrors.confirmPassword
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
                placeholder="Re-enter your password"
                disabled={loading}
              />
              {validationErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {validationErrors.confirmPassword}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            🔒 Zero-knowledge encryption • Your data never leaves your device unencrypted
          </p>
        </div>
      </div>
    </div>
  )
}
