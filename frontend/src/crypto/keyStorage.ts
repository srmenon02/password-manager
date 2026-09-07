/**
 * Survives a page reload without ever putting key material on disk in readable form.
 *
 * IndexedDB structured-clones a CryptoKey as an opaque handle, so a key imported with
 * `extractable: false` can be used to decrypt but its bytes can never be read back —
 * `crypto.subtle.exportKey` on it throws. Script running on this origin can therefore
 * unlock the vault while the page is open, but cannot exfiltrate a key that would
 * decrypt the vault offline or after the handle is deleted.
 *
 * Scope is the browser tab, not the origin: the record is keyed by a random id held in
 * sessionStorage, which the browser drops when the tab closes. A reload keeps the id and
 * restores; a new tab, a restored window, or another tab on the same origin finds no id
 * and stays locked.
 */

const DB_NAME = 'vaultkey'
const STORE_NAME = 'session'
const HANDLE_KEY = 'vaultkey_session_handle'

// Rolling: every successful restore pushes it out again, so an actively used tab stays
// unlocked and one left idle past this window has to unlock with the master password.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000

interface StoredSession {
  key: CryptoKey
  expiresAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

/**
 * Re-imports the vault key as non-extractable and stores it against a fresh tab-scoped
 * handle. The in-memory key passed in is untouched and stays extractable so the existing
 * wrap/re-wrap paths keep working.
 */
export async function persistVaultKey(vaultKey: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey('raw', vaultKey)
  const sealed = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])

  const handle = crypto.randomUUID()
  const session: StoredSession = { key: sealed, expiresAt: Date.now() + IDLE_TIMEOUT_MS }
  await transact('readwrite', (store) => store.put(session, handle))
  sessionStorage.setItem(HANDLE_KEY, handle)
}

/**
 * Returns the stored key if this tab has a live handle, otherwise null. Any handle that
 * has expired, or whose record is gone, is cleared rather than reused.
 */
export async function restoreVaultKey(): Promise<CryptoKey | null> {
  const handle = sessionStorage.getItem(HANDLE_KEY)
  if (!handle) {
    return null
  }

  const session = await transact<StoredSession | undefined>('readonly', (store) =>
    store.get(handle)
  )
  if (!session || session.expiresAt <= Date.now()) {
    await clearVaultKey()
    return null
  }

  await transact('readwrite', (store) =>
    store.put({ key: session.key, expiresAt: Date.now() + IDLE_TIMEOUT_MS }, handle)
  )
  return session.key
}

export async function clearVaultKey(): Promise<void> {
  const handle = sessionStorage.getItem(HANDLE_KEY)
  sessionStorage.removeItem(HANDLE_KEY)
  if (handle) {
    await transact('readwrite', (store) => store.delete(handle))
  }
}
