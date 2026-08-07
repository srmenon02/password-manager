import type { VaultData, VaultEntry } from '@shared/types'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { encryptVault } from '@/crypto/vaultEncryption'
import { updateVault as updateVaultRequest } from '@/services/api'
import { createVaultEntry, type VaultEntryInput, updateVaultEntry } from '@/models/vault'

interface VaultContextValue {
  vaultData: VaultData | null
  token: string | null
  isUnlocked: boolean
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
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined)

export function VaultProvider({ children }: PropsWithChildren) {
  const [vaultData, setVaultData] = useState<VaultData | null>(null)
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const setVaultSession = useCallback(
    (session: { vaultData: VaultData; vaultKey: CryptoKey; token: string }) => {
      setVaultData(session.vaultData)
      setVaultKey(session.vaultKey)
      setToken(session.token)
    },
    []
  )

  const clearVaultSession = useCallback(() => {
    setVaultData(null)
    setVaultKey(null)
    setToken(null)
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
      token,
      isUnlocked: vaultData !== null && vaultKey !== null,
      isSaving,
      setVaultSession,
      clearVaultSession,
      addEntry,
      editEntry,
      removeEntry,
      saveVault,
    }),
    [
      addEntry,
      clearVaultSession,
      editEntry,
      isSaving,
      removeEntry,
      saveVault,
      setVaultSession,
      token,
      vaultData,
      vaultKey,
    ]
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const context = useContext(VaultContext)
  if (!context) {
    throw new Error('useVault must be used within VaultProvider')
  }
  return context
}
