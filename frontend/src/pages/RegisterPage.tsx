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
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'

export default function RegisterPage() {
  usePageMeta(
    'Create Account · cipher',
    'Create your zero-knowledge cipher account. Your master password is derived and used entirely client-side.'
  )
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
    const fieldOrder = ['email', 'password', 'confirmPassword'] as const

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

    // The form is noValidate so these messages actually reach the user; that also means
    // nothing moves focus for us the way native constraint validation did.
    const firstInvalid = fieldOrder.find((field) => errors[field])
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return false
    }
    return true
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

      localStorage.setItem('cipher_token', response.token)

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
      <AppHeader
        nav={[
          { label: 'Login', to: '/login' },
          { label: 'Generator', to: '/generator' },
        ]}
      />

      <main className="flex-grow flex flex-col lg:flex-row relative">
        <div className="hidden lg:flex w-full lg:w-1/2 items-center justify-center bg-surface-container-highest p-margin-safe border-r border-taupe">
          {/* Not a heading: it precedes the page's h1 in the DOM, and it is a statement
              rather than a section title. */}
          <div className="max-w-md text-center">
            <p className="font-headline-md text-headline-md font-bold text-ink mb-4 tracking-tighter">Create your secured vault.</p>
            <p className="font-body-lg text-body-lg text-on-surface-variant text-balance">
              Fortifies your logins, passwords, and digital identity.
            </p>
          </div>
        </div>

        <div className="w-full flex items-center p-margin-safe pt-12 lg:p-[120px] bg-paper lg:w-1/2">
          <div className="w-full max-w-md mx-auto">
            <h1 className="font-headline-md text-headline-md font-bold text-ink mb-12">Create Account</h1>

            {error && (
              <div
                role="alert"
                className="mb-6 border-2 border-error bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-ink tracking-widest uppercase font-bold" htmlFor="email">Email Address</label>
                <input
                  className="w-full border-x-0 border-t-0 border-b-2 border-solid border-taupe rounded-none bg-transparent py-3 px-0 font-body-md text-ink focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  id="email"
                  placeholder="jane@example.com"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  aria-invalid={validationErrors.email ? true : undefined}
                  aria-describedby={validationErrors.email ? 'email-error' : undefined}
                />
                {validationErrors.email && (
                  <p id="email-error" role="alert" className="text-sm text-error">
                    {validationErrors.email}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-ink tracking-widest uppercase font-bold" htmlFor="password">
                  Master Password
                </label>
                <div className="relative">
                  <input
                    className="w-full border-x-0 border-t-0 border-b-2 border-solid border-taupe rounded-none bg-transparent py-3 pr-20 px-0 font-body-md text-ink focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    id="password"
                    placeholder="************"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    minLength={12}
                    required
                    aria-invalid={validationErrors.password ? true : undefined}
                    aria-describedby={
                      validationErrors.password ? 'password-hint password-error' : 'password-hint'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-pressed={showPassword}
                    aria-label={`${showPassword ? 'Hide' : 'Show'} master password`}
                    className="absolute right-0 top-1/2 -translate-y-1/2 min-h-11 px-2 inline-flex items-center text-on-surface-variant font-body-md cursor-pointer hover:text-primary transition-colors duration-200"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p id="password-hint" className="text-sm text-on-surface-variant mt-1">
                  Minimum 12 characters, mix of cases and symbols.
                </p>
                {validationErrors.password && (
                  <p id="password-error" role="alert" className="text-sm text-error">
                    {validationErrors.password}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-ink tracking-widest uppercase font-bold" htmlFor="confirmPassword">Confirm Password</label>
                <div className="relative">
                  <input
                    className="w-full border-x-0 border-t-0 border-b-2 border-solid border-taupe rounded-none bg-transparent py-3 pr-20 px-0 font-body-md text-ink focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    id="confirmPassword"
                    placeholder="************"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                    aria-invalid={validationErrors.confirmPassword ? true : undefined}
                    aria-describedby={
                      validationErrors.confirmPassword ? 'confirmPassword-error' : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    aria-pressed={showConfirmPassword}
                    aria-label={`${showConfirmPassword ? 'Hide' : 'Show'} password confirmation`}
                    className="absolute right-0 top-1/2 -translate-y-1/2 min-h-11 px-2 inline-flex items-center text-on-surface-variant font-body-md cursor-pointer hover:text-primary transition-colors duration-200"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {validationErrors.confirmPassword && (
                  <p id="confirmPassword-error" role="alert" className="text-sm text-error">
                    {validationErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-6">
                <p className="text-sm text-on-surface-variant text-center">
                  Master passwords cannot be reset.
                </p>
                <button className="relative w-full rounded-full p-[2px] transition-transform duration-300 hover:scale-105 active:scale-100 overflow-hidden group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" type="submit" disabled={loading}>
                  <div className="absolute inset-0 register-button-bg z-0"></div>
                  <div className="relative z-10 w-full bg-ink text-mint font-body-lg text-body-lg py-4 font-bold rounded-full text-center flex items-center justify-center">
                    {loading ? 'Creating Account…' : 'Register'}
                  </div>
                </button>
                <p className="text-sm text-on-surface-variant text-center">
                  Already have an account?{' '}
                  <Link to="/login" className="text-ink font-bold hover:text-primary transition-colors duration-200">
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
