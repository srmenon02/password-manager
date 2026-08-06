import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function VaultPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('vaultkey_token')
    if (!token) {
      navigate('/register')
    }
  }, [navigate])

  function handleLogout() {
    localStorage.clear()
    navigate('/')
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

            <div className="text-center py-12">
              <div className="mb-4">
                <svg
                  className="mx-auto h-16 w-16 text-indigo-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                Logged in!
              </h2>
              <p className="text-gray-600">
                Vault UI coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
