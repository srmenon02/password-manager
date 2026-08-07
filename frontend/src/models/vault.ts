import type { VaultData, VaultEntry } from '@shared/types'

export interface VaultEntryInput {
  site: string
  username: string
  password: string
  notes?: string
}

export const CURRENT_VAULT_VERSION = 1

export function createEmptyVault(): VaultData {
  return {
    entries: [],
    version: CURRENT_VAULT_VERSION,
  }
}

export function createVaultEntry(input: VaultEntryInput): VaultEntry {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    site: input.site.trim(),
    username: input.username.trim(),
    password: input.password,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateVaultEntry(
  entry: VaultEntry,
  updates: VaultEntryInput
): VaultEntry {
  return {
    ...entry,
    site: updates.site.trim(),
    username: updates.username.trim(),
    password: updates.password,
    notes: updates.notes?.trim() || undefined,
    updatedAt: new Date(),
  }
}

export function serializeVaultData(data: VaultData): string {
  return JSON.stringify(data)
}

export function deserializeVaultData(serialized: string): VaultData {
  const parsed = JSON.parse(serialized) as VaultData
  return {
    version: parsed.version,
    entries: parsed.entries.map((entry) => ({
      ...entry,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    })),
  }
}
