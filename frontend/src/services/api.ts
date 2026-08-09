import type { 
  RegisterRequest, 
  RegisterResponse, 
  LoginInitRequest,
  LoginInitResponse,
  LoginVerifyRequest,
  LoginVerifyResponse,
  VaultResponse,
  VaultUpdateRequest,
  ErrorResponse 
} from '@shared/types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

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
