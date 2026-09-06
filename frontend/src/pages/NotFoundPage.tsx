import { Link, useNavigate } from 'react-router-dom'
import { usePageMeta } from '@/hooks/usePageMeta'

function NotFoundPage() {
  usePageMeta('Page Not Found · VaultKey', "The page you're looking for doesn't exist.")
  const navigate = useNavigate()

  return (
    <div className="bg-paper text-on-surface font-body-md min-h-screen flex flex-col">
      <header className="w-full min-h-16 py-2 bg-paper flex flex-wrap gap-x-4 gap-y-2 justify-between items-center px-gutter max-w-full z-50 relative">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">VaultKey</Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 md:gap-8">
          <Link to="/login" className="text-on-surface-variant font-body-md cursor-pointer hover:text-primary transition-colors duration-200">Login</Link>
          <Link to="/register" className="text-on-surface-variant font-body-md cursor-pointer hover:text-primary transition-colors duration-200">Create Account</Link>
        </nav>
      </header>

      <main className="flex-grow flex items-center relative overflow-hidden px-gutter py-32 md:py-hero-offset">
        <div
          className="hidden md:block absolute rounded-full bg-blush -z-10"
          style={{ width: '280px', height: '280px', top: '15%', right: '10%' }}
          aria-hidden="true"
        ></div>
        <div
          className="hidden md:block absolute rounded-full bg-mint -z-10"
          style={{ width: '120px', height: '120px', bottom: '12%', right: '22%' }}
          aria-hidden="true"
        ></div>

        <div className="max-w-7xl mx-auto w-full">
          <div className="max-w-2xl md:ml-[15%] space-y-8 text-center md:text-left">
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">Error — 404</span>
            <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink font-bold tracking-tighter leading-tight">
              This page slipped<br />out of the vault.
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto md:mx-0">
              We couldn't find what you were looking for. It may have been moved, renamed, or never existed in the first place.
            </p>
            <div className="flex flex-wrap items-center gap-6 pt-4 justify-center md:justify-start">
              <button
                className="shine-button font-body-md px-8 py-4 uppercase tracking-wider"
                onClick={() => navigate('/')}
              >
                Back to Safety
              </button>
              <button
                className="vault-btn-secondary px-8 py-4 font-body-md uppercase tracking-wider"
                onClick={() => navigate(-1)}
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default NotFoundPage
