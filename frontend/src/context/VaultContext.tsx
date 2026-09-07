import type { VaultData, VaultEntry } from '@shared/types'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { decryptVault, encryptVault } from '@/crypto/vaultEncryption'
import { clearVaultKey, persistVaultKey, restoreVaultKey } from '@/crypto/keyStorage'
import {
  updateVault as updateVaultRequest,
  getVault as getVaultRequest,
  checkPasswordBreach,
} from '@/services/api'
import { createVaultEntry, type VaultEntryInput, updateVaultEntry } from '@/models/vault'

interface VaultContextValue {
  vaultData: VaultData | null
  vaultKey: CryptoKey | null
  token: string | null
  isUnlocked: boolean
  isRestoring: boolean
  isSaving: boolean
  setVaultSession: (session: {
    vaultData: VaultData
    vaultKey: CryptoKey
    token: string
  }) => void
  clearVaultSession: () => void
  addEntry: (input: VaultEntryInput) => void
  editEntry: (id: string, input: VaultEntryInput) => void
  removeEntry: (id: string) => void
  saveVault: () => Promise<void>
  checkPasswordBreach: (password: string) => Promise<boolean>
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined)

export function VaultProvider({ children }: PropsWithChildren) {
  const [vaultData, setVaultData] = useState<VaultData | null>(null)
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)

  const setVaultSession = useCallback(
    (session: { vaultData: VaultData; vaultKey: CryptoKey; token: string }) => {
      setVaultData(session.vaultData)
      setVaultKey(session.vaultKey)
      setToken(session.token)
      // Best-effort: a browser that refuses IndexedDB still gets a working in-memory
      // session, it just cannot survive a reload.
      void persistVaultKey(session.vaultKey).catch(() => undefined)
    },
    []
  )

  const clearVaultSession = useCallback(() => {
    setVaultData(null)
    setVaultKey(null)
    setToken(null)
    void clearVaultKey().catch(() => undefined)
  }, [])

  // Rehydrate after a reload: the JWT is in localStorage and the vault key handle is in
  // IndexedDB, so the encrypted blob can be re-fetched and decrypted without the master
  // password. Any failure leaves the vault locked rather than half-open.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      try {
        const storedToken = localStorage.getItem('vaultkey_token')
        const storedKey = storedToken ? await restoreVaultKey() : null
        if (!storedToken || !storedKey) {
          return
        }

        const vault = await getVaultRequest(storedToken)
        const restored = await decryptVault(
          { ciphertext: vault.encrypted_blob, iv: vault.vault_iv },
          storedKey
        )
        if (cancelled) {
          return
        }

        setVaultData(restored)
        setVaultKey(storedKey)
        setToken(storedToken)
      } catch {
        // An expired JWT, a rotated vault, or a corrupt handle all mean the same thing.
        await clearVaultKey().catch(() => undefined)
      } finally {
        if (!cancelled) {
          setIsRestoring(false)
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const addEntry = useCallback((input: VaultEntryInput) => {
    setVaultData((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        entries: [...current.entries, createVaultEntry(input)],
      }
    })
  }, [])

  const editEntry = useCallback((id: string, input: VaultEntryInput) => {
    setVaultData((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        entries: current.entries.map((entry) =>
          entry.id === id ? updateVaultEntry(entry, input) : entry
        ),
      }
    })
  }, [])

  const removeEntry = useCallback((id: string) => {
    setVaultData((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        entries: current.entries.filter((entry: VaultEntry) => entry.id !== id),
      }
    })
  }, [])

  const saveVault = useCallback(async () => {
    if (!vaultData || !vaultKey || !token) {
      throw new Error('Vault session is locked')
    }

    setIsSaving(true)
    try {
      const encrypted = await encryptVault(vaultData, vaultKey)
      await updateVaultRequest(token, {
        encrypted_blob: encrypted.ciphertext,
        vault_iv: encrypted.iv,
      })
    } finally {
      setIsSaving(false)
    }
  }, [token, vaultData, vaultKey])

  const value = useMemo<VaultContextValue>(
    () => ({
      vaultData,
      vaultKey,
      token,
      isUnlocked: vaultData !== null && vaultKey !== null,
      isRestoring,
      isSaving,
      setVaultSession,
      clearVaultSession,
      addEntry,
      editEntry,
      removeEntry,
      saveVault,
      checkPasswordBreach,
    }),
    [
      addEntry,
      clearVaultSession,
      editEntry,
      isRestoring,
      isSaving,
      removeEntry,
      saveVault,
      setVaultSession,
      vaultKey,
      token,
      vaultData,
    ]
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

// Co-located with its provider on purpose: splitting the accessor into another module to
// satisfy Fast Refresh would churn imports across every consumer for no runtime benefit.
// eslint-disable-next-line react-refresh/only-export-components
export function useVault() {
  const context = useContext(VaultContext)
  if (!context) {
    throw new Error('useVault must be used within VaultProvider')
  }
  return context
}