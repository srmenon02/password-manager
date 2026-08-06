import { Link } from 'react-router-dom'

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <div className="mb-8">
          <svg
            className="mx-auto h-20 w-20 text-indigo-600 mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            VaultKey
          </h1>
          <p className="text-2xl text-gray-700 font-medium mb-2">
            Zero-Knowledge Password Manager
          </p>
          <p className="text-lg text-gray-600">
            Your passwords, encrypted client-side. We never see your data.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div>
              <div className="bg-indigo-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <span className="text-indigo-600 font-bold text-xl">1</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Client-Side Encryption</h3>
              <p className="text-sm text-gray-600">
                All encryption happens in your browser. Your master password never leaves your device.
              </p>
            </div>
            <div>
              <div className="bg-indigo-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <span className="text-indigo-600 font-bold text-xl">2</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Zero-Knowledge</h3>
              <p className="text-sm text-gray-600">
                We store only encrypted data. Even if our servers are compromised, your passwords stay safe.
              </p>
            </div>
            <div>
              <div className="bg-indigo-100 rounded-full w-12 h-12 flex items-center justify-center mb-3">
                <span className="text-indigo-600 font-bold text-xl">3</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">SRP Authentication</h3>
              <p className="text-sm text-gray-600">
                Secure Remote Password protocol ensures authentication without transmitting your password.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            to="/register"
            className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition shadow-lg"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="px-8 py-3 bg-white text-indigo-600 font-medium rounded-md border-2 border-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition shadow-lg"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

export default HomePage
