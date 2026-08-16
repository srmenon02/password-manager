import type { 
  RegisterRequest, 
  RegisterResponse, 
  LoginInitRequest,
  LoginInitResponse,
  LoginVerifyRequest,
  LoginVerifyResponse,
  VaultResponse,
  VaultUpdateRequest,
  SharingKeyRegistrationRequest,
  ShareInitRequest,
  ShareInitResponse,
  ShareCreateRequest,
  ShareCreateResponse,
  SharedInboxItem,
  AuditLogEntry,
  AuditLogListResponse,
  AuditLogVerifyResponse,
  ErrorResponse,
  BreachResultInput,
  BreachResultResponse,
  BreachResultsListResponse,
} from '@shared/types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(normalized + padding)
}

export function getJwtSubject(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) {
      return null
    }

    const payload = JSON.parse(decodeBase64Url(parts[1])) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export async function registerUser(data: RegisterRequest): Promise<RegisterResponse> {
  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (response.status !== 201) {
      const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
      throw new Error(errorData.message || errorData.detail?.message || 'Registration failed')
    }

    const result: RegisterResponse = await response.json()
    return result
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('An unexpected error occurred during registration')
  }
}

/**
 * Step 1 of SRP login: Send email and client ephemeral A
 */
export async function loginInit(data: LoginInitRequest): Promise<LoginInitResponse> {
  try {
    const response = await fetch(`${API_URL}/api/login/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
      throw new Error(errorData.message || errorData.detail?.message || 'Login initialization failed')
    }

    const result: LoginInitResponse = await response.json()
    return result
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('An unexpected error occurred during login initialization')
  }
}

/**
 * Step 2 of SRP login: Send proof M1 and receive M2 + JWT
 */
export async function loginVerify(data: LoginVerifyRequest): Promise<LoginVerifyResponse> {
  try {
    const response = await fetch(`${API_URL}/api/login/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
      throw new Error(errorData.message || errorData.detail?.message || 'Login verification failed')
    }

    const result: LoginVerifyResponse = await response.json()
    return result
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('An unexpected error occurred during login verification')
  }
}

/**
 * Fetch the user's encrypted vault (requires JWT token)
 */
export async function getVault(token: string): Promise<VaultResponse> {
  try {
    const response = await fetch(`${API_URL}/api/vault`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
      throw new Error(errorData.message || errorData.detail?.message || 'Failed to fetch vault')
    }

    const result: VaultResponse = await response.json()
    return result
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('An unexpected error occurred while fetching vault')
  }
}

async function sha1(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export async function checkPasswordBreach(password: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const hash = await sha1(password)
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)

  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { signal })

  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  if (!response.ok) {
    throw new Error('Failed to check password breach status')
  }

  const text = await response.text()
  const lines = text.split('\n')

  for (const line of lines) {
    const [lineSuffix] = line.split(':')
    if (lineSuffix.trim() === suffix) {
      return true
    }
  }

  return false
}

export async function updateVault(
  token: string,
  data: VaultUpdateRequest
): Promise<{ updated_at?: string; message?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/vault`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
      throw new Error(errorData.message || errorData.detail?.message || 'Failed to update vault')
    }

    return response.json()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('An unexpected error occurred while updating vault')
  }
}

export async function saveBreachResults(
  token: string,
  results: BreachResultInput[]
): Promise<BreachResultResponse[]> {
  const response = await fetch(`${API_URL}/api/vault/breaches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ results }),
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to save breach results')
  }

  const result = await response.json() as BreachResultsListResponse
  return result.results
}

export async function listBreachResults(
  token: string
): Promise<BreachResultResponse[]> {
  const response = await fetch(`${API_URL}/api/vault/breaches`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to load breach results')
  }

  const result = await response.json() as BreachResultsListResponse
  return result.results
}

export async function registerSharingKeys(
  token: string,
  data: SharingKeyRegistrationRequest
): Promise<void> {
  const response = await fetch(`${API_URL}/api/share/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  if (!response.ok && response.status !== 204) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to register sharing keys')
  }
}

export async function getSharingKeys(token: string): Promise<{
  sharing_public_key: string
  encrypted_private_key: string
  encrypted_private_key_iv: string
  algorithm: string
}> {
  const response = await fetch(`${API_URL}/api/share/keys`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to load sharing keys')
  }

  return response.json()
}

export async function initShare(
  token: string,
  data: ShareInitRequest
): Promise<ShareInitResponse> {
  const response = await fetch(`${API_URL}/api/share/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to initialize sharing')
  }

  return response.json()
}

export async function createShare(
  token: string,
  data: ShareCreateRequest
): Promise<ShareCreateResponse> {
  const response = await fetch(`${API_URL}/api/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to create share')
  }

  return response.json()
}

export async function getSharedWithMe(token: string): Promise<SharedInboxItem[]> {
  const response = await fetch(`${API_URL}/api/share/shared-with-me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to load shared items')
  }

  const result = await response.json() as { items: SharedInboxItem[] }
  return result.items
}

export async function revokeShare(token: string, shareId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/share/${shareId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok && response.status !== 204) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to revoke share')
  }
}

export async function deleteSharedItem(token: string, shareId: string): Promise<void> {
  await revokeShare(token, shareId)
}

export async function getAuditLog(token: string): Promise<AuditLogEntry[]> {
  const response = await fetch(`${API_URL}/api/audit`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to load audit log')
  }

  const result = await response.json() as AuditLogListResponse
  return result.entries
}

export async function verifyAuditLog(token: string): Promise<AuditLogVerifyResponse> {
  const response = await fetch(`${API_URL}/api/audit/verify`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorData: ErrorResponse & { detail?: { message?: string } } = await response.json()
    throw new Error(errorData.message || errorData.detail?.message || 'Failed to verify audit log')
  }

  return response.json()
}
