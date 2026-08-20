import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { generateSalt, deriveKey } from '@/crypto/keyDerivation'
import { generateSRPVerifier } from '@/crypto/srp'
import { arrayBufferToBase64, encryptVault } from '@/crypto/vaultEncryption'
import type { RegisterRequest, VaultData } from '@shared/types'
import { wrapKey } from '@/crypto/keyWrapping'
import { registerUser } from '@/services/api'
import { useVault } from '@/context/VaultContext'
import { createEmptyVault } from '@/models/vault'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
      const salt = generateSalt()
      const masterKey = await deriveKey(password, salt)
      const authVerifier = await generateSRPVerifier(email, password, salt)

      const vaultKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )

      const { protectedKey, iv: protectedKeyIv } = await wrapKey(vaultKey, masterKey)
      const emptyVault: VaultData = createEmptyVault()
      const { ciphertext: encryptedBlob, iv: vaultIv } = await encryptVault(emptyVault, vaultKey)

      const registerData: RegisterRequest = {
        email,
        salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
        auth_verifier: authVerifier,
        protected_key: protectedKey,
        protected_key_iv: protectedKeyIv,
        encrypted_blob: encryptedBlob,
        vault_iv: vaultIv,
      }

      const response = await registerUser(registerData)

      localStorage.setItem('vaultkey_token', response.token)

      setVaultSession({
        vaultData: emptyVault,
        vaultKey,
        token: response.token,
      })

      navigate('/vault')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-paper text-ink min-h-screen flex flex-col antialiased selection:bg-mint selection:text-ink">
      <Link
        to="/"
        className="absolute top-0 left-0 px-gutter h-16 flex items-center font-headline-md text-headline-md font-bold text-primary tracking-tighter hover:opacity-75 transition-opacity z-10"
      >
        VaultKey
      </Link>

      <main className="flex-grow flex flex-col lg:flex-row relative">
        <div className="hidden lg:flex w-full lg:w-1/2 items-center justify-center bg-surface-container-highest p-margin-safe border-r border-taupe">
          <div className="max-w-md text-center">
            <h3 className="font-headline-md text-headline-md font-bold text-ink mb-4 tracking-tighter">Create your secured vault.</h3>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Fortifies your logins, passwords, and digital identity.
            </p>
          </div>
        </div>

        <div className="w-full flex items-center p-margin-safe lg:p-[120px] bg-paper lg:w-1/2">
          <div className="w-full max-w-md ml-auto mr-auto lg:ml-0 lg:mr-auto">
            <div className="mb-12">
              <h2 className="font-headline-md text-headline-md font-bold text-ink mb-2">Create Account</h2>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-ink tracking-widest uppercase font-bold" htmlFor="email">Email Address</label>
                <input
                  className="w-full border-none border-b-2 border-taupe rounded-none bg-transparent py-3 px-0 font-body-md text-ink focus:outline-none focus:shadow-none focus:border-mint"
                  id="email"
                  placeholder="jane@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
                {validationErrors.email && <p className="text-sm text-red-700">{validationErrors.email}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-ink tracking-widest uppercase flex justify-between font-bold" htmlFor="password">
                  <span>Master Password</span>
                </label>
                <div className="relative">
                  <input
                    className="w-full border-none border-b-2 border-taupe rounded-none bg-transparent py-3 pr-14 px-0 font-body-md text-ink focus:outline-none focus:shadow-none focus:border-mint"
                    id="password"
                    placeholder="************"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    minLength={12}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-1">Minimum 12 characters, mix of cases and symbols.</p>
                {validationErrors.password && <p className="text-sm text-red-700">{validationErrors.password}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-ink tracking-widest uppercase font-bold" htmlFor="confirmPassword">Confirm Password</label>
                <div className="relative">
                  <input
                    className="w-full border-none border-b-2 border-taupe rounded-none bg-transparent py-3 pr-14 px-0 font-body-md text-ink focus:outline-none focus:shadow-none focus:border-mint"
                    id="confirmPassword"
                    placeholder="************"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {validationErrors.confirmPassword && <p className="text-sm text-red-700">{validationErrors.confirmPassword}</p>}
              </div>

              <div className="mt-8 flex flex-col gap-6">
                <p className="text-sm text-on-surface-variant text-center">
                  Master passwords cannot be reset.
                </p>
                <button className="relative w-full rounded-full p-[2px] transition-transform duration-300 hover:scale-105 active:scale-100 overflow-hidden group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" type="submit" disabled={loading}>
                  <div className="absolute inset-0 register-button-bg z-0"></div>
                  <div className="relative z-10 w-full bg-ink text-mint font-body-lg text-body-lg py-4 font-bold rounded-full text-center flex items-center justify-center">
                    {loading ? 'Creating Account...' : 'Register'}
                  </div>
                </button>
                <p className="text-sm text-on-surface-variant text-center">
                  Already have an account?{' '}
                  <Link to="/login" className="text-ink font-bold hover:text-pink transition-colors duration-200">
                    Log In
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
