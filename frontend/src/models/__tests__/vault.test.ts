import { describe, expect, it } from 'vitest'
import {
  CURRENT_VAULT_VERSION,
  createEmptyVault,
  createVaultEntry,
  deserializeVaultData,
  serializeVaultData,
  updateVaultEntry,
} from '../vault'

describe('vault model', () => {
  it('creates an empty vault with current version', () => {
    const vault = createEmptyVault()
    expect(vault.entries).toHaveLength(0)
    expect(vault.version).toBe(CURRENT_VAULT_VERSION)
  })

  it('creates a vault entry from input', () => {
    const entry = createVaultEntry({
      site: ' github.com ',
      username: ' user ',
      password: 'secret',
      notes: '  personal account  ',
    })

    expect(entry.id.length).toBeGreaterThan(0)
    expect(entry.site).toBe('github.com')
    expect(entry.username).toBe('user')
    expect(entry.password).toBe('secret')
    expect(entry.notes).toBe('personal account')
    expect(entry.createdAt).toBeInstanceOf(Date)
    expect(entry.updatedAt).toBeInstanceOf(Date)
  })

  it('updates vault entry while keeping immutable fields', () => {
    const original = createVaultEntry({
      site: 'example.com',
      username: 'alice',
      password: 'old',
    })

    const updated = updateVaultEntry(original, {
      site: 'new.example.com',
      username: 'alice2',
      password: 'new',
      notes: 'updated',
    })

    expect(updated.id).toBe(original.id)
    expect(updated.createdAt).toEqual(original.createdAt)
    expect(updated.site).toBe('new.example.com')
    expect(updated.username).toBe('alice2')
    expect(updated.password).toBe('new')
    expect(updated.notes).toBe('updated')
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime())
  })

  it('serializes and deserializes vault dates', () => {
    const entry = createVaultEntry({
      site: 'site.com',
      username: 'user',
      password: 'pass',
    })

    const serialized = serializeVaultData({
      entries: [entry],
      version: CURRENT_VAULT_VERSION,
    })

    const parsed = deserializeVaultData(serialized)
    expect(parsed.entries[0].createdAt).toBeInstanceOf(Date)
    expect(parsed.entries[0].updatedAt).toBeInstanceOf(Date)
    expect(parsed.entries[0].site).toBe('site.com')
  })
})
