import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVault } from '@/context/VaultContext'
import type { VaultEntryInput } from '@/models/vault'
import { generateSecurePassword } from '@/crypto/passwordGenerator'

const defaultFormState: VaultEntryInput = {
  site: '',
  username: '',
  password: '',
  notes: '',
}

export default function VaultPage() {
  const navigate = useNavigate()
  const {
    vaultData,
    isUnlocked,
    isSaving,
    clearVaultSession,
    addEntry,
    editEntry,
    removeEntry,
    saveVault,
  } = useVault()
  const [formState, setFormState] = useState<VaultEntryInput>(defaultFormState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('vaultkey_token')
    if (!token) {
      navigate('/login')
    }
  }, [navigate])

  const sortedEntries = useMemo(() => {
    if (!vaultData) {
      return []
    }

    return [...vaultData.entries].sort((a, b) =>
      a.site.localeCompare(b.site, undefined, { sensitivity: 'base' })
    )
  }, [vaultData])

  function handleLogout() {
    localStorage.clear()
    clearVaultSession()
    navigate('/')
  }

  function resetForm() {
    setFormState(defaultFormState)
    setEditingId(null)
  }

  function validateForm(): boolean {
    if (!formState.site.trim() || !formState.username.trim() || !formState.password) {
      setError('Site, username, and password are required')
      return false
    }
    return true
  }

  function handleSubmitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaveMessage(null)

    if (!validateForm()) {
      return
    }

    if (editingId) {
      editEntry(editingId, formState)
    } else {
      addEntry(formState)
    }

    resetForm()
  }

  function handleEditStart(entryId: string) {
    if (!vaultData) {
      return
    }

    const entry = vaultData.entries.find((item) => item.id === entryId)
    if (!entry) {
      return
    }

    setEditingId(entry.id)
    setFormState({
      site: entry.site,
      username: entry.username,
      password: entry.password,
      notes: entry.notes || '',
    })
  }

  async function handleSaveVault() {
    setError(null)
    setSaveMessage(null)

    try {
      await saveVault()
      setSaveMessage('Vault saved')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save vault')
    }
  }

  function handleGeneratePassword() {
    setError(null)
    const site = formState.site.trim()

    if (!site) {
      setError('Enter a site first, then generate a password')
      return
    }

    const generatedPassword = generateSecurePassword({ length: 24 })
    setFormState((prev) => ({
      ...prev,
      password: generatedPassword,
    }))
  }

  if (!isUnlocked || !vaultData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Vault Locked</h1>
            <p className="text-gray-600 mb-6">Sign in to decrypt and edit your vault.</p>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900">
                Your Vault
              </h1>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-600 text-white rounded-md font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition"
              >
                Logout
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">
                {error}
              </div>
            )}

            {saveMessage && (
              <div className="mb-4 p-3 rounded-md border border-green-200 bg-green-50 text-green-800 text-sm">
                {saveMessage}
              </div>
            )}

            <form onSubmit={handleSubmitEntry} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <input
                type="text"
                value={formState.site}
                onChange={(event) => setFormState((prev) => ({ ...prev, site: event.target.value }))}
                className="px-4 py-2 border border-gray-300 rounded-md"
                placeholder="Site"
              />
              <input
                type="text"
                value={formState.username}
                onChange={(event) => setFormState((prev) => ({ ...prev, username: event.target.value }))}
                className="px-4 py-2 border border-gray-300 rounded-md"
                placeholder="Username"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formState.password}
                  onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="px-3 py-2 bg-slate-100 text-slate-800 rounded-md font-medium hover:bg-slate-200 transition"
                >
                  Generate
                </button>
              </div>
              <input
                type="text"
                value={formState.notes || ''}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                className="px-4 py-2 border border-gray-300 rounded-md"
                placeholder="Notes"
              />

              <div className="md:col-span-2 flex gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition"
                >
                  {editingId ? 'Update Entry' : 'Add Entry'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md font-medium hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full bg-white">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Site</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Username</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Password</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Notes</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No entries yet.
                      </td>
                    </tr>
                  )}
                  {sortedEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-sm text-gray-800">{entry.site}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{entry.username}</td>
                      <td className="px-4 py-3 text-sm text-gray-800 font-mono">{entry.password}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.notes || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleEditStart(entry.id)}
                          className="text-indigo-600 hover:text-indigo-700 text-sm mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeEntry(entry.id)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <button
                onClick={handleSaveVault}
                disabled={isSaving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isSaving ? 'Saving...' : 'Save Vault'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
