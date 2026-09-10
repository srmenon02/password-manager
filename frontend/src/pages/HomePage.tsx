import { Link, useNavigate } from 'react-router-dom'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'
import {
  heroAction,
  heroLabel,
  primaryAction,
} from '@/components/controlStyles'

function HomePage() {
  const navigate = useNavigate()
  usePageMeta(
    'cipher · Zero-Knowledge Password Manager',
    'Store and share your passwords with client-side, zero-knowledge encryption. Your master password never leaves your device.'
  )

  return (
    <div className="bg-paper text-on-surface font-body-md min-h-screen flex flex-col">
      <AppHeader
        nav={[
          { label: 'Login', to: '/login' },
          { label: 'Generator', to: '/generator' },
        ]}
        action={
          <button
            type="button"
            className={`${primaryAction} hidden md:inline-flex`}
            onClick={() => navigate('/register')}
          >
            Get started
          </button>
        }
      />

      <main className="flex-grow">
        <section className="w-full px-gutter pt-24 pb-24 md:pt-48 md:pb-56">
          <div className="w-full max-w-4xl mx-auto space-y-8 text-center">
            <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink font-bold tracking-tighter leading-tight">
              Your logins,<br />secured.
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto md:text-balance">
              Zero-knowledge encryption and authentication, ensuring your secrets are both safe and accessible.
            </p>
            <div className="pt-4">
              <button type="button" className={heroAction} onClick={() => navigate('/register')}>
                <span className={heroLabel}>Get started</span>
              </button>
            </div>
          </div>
        </section>

        <section className="w-full px-gutter py-24 md:py-32 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16 text-center">
              <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant mb-4">How it works</h2>
              <div className="h-px w-24 bg-ink mx-auto"></div>
            </div>
            {/* Column offsets cascade left to right (0 / 48 / 96) and collapse on mobile,
                where an uneven stack reads as a mistake rather than as a rhythm. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8">
              <div className="flex flex-col space-y-4">
                <h3 className="font-headline-md text-headline-md text-ink pb-4 border-b border-ink">Client-Side Encryption</h3>
                <p className="font-body-md text-body-md text-on-surface-variant pt-4">All encryption happens in your browser. Your master password never leaves your device.</p>
              </div>
              <div className="flex flex-col space-y-4 md:pt-12">
                <h3 className="font-headline-md text-headline-md text-ink pb-4 border-b border-ink">Zero-Knowledge</h3>
                <p className="font-body-md text-body-md text-on-surface-variant pt-4">Only encrypted data is stored, ensuring that even if servers are compromised, your passwords stay safe.</p>
              </div>
              <div className="flex flex-col space-y-4 md:pt-24">
                <h3 className="font-headline-md text-headline-md text-ink pb-4 border-b border-ink">SRP Authentication</h3>
                <p className="font-body-md text-body-md text-on-surface-variant pt-4">Secure Remote Password protocol ensures authentication without transmitting your password.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-taupe px-gutter py-12 pb-28 md:pb-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 md:gap-8 justify-between items-start md:items-center">
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            cipher — encrypted in your browser
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/privacy" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Privacy</Link>
            <Link to="/terms" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Terms</Link>
          </nav>
        </div>
      </footer>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-ink bg-paper px-gutter py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          className={`${primaryAction} w-full`}
          onClick={() => navigate('/register')}
        >
          Create your vault
        </button>
      </div>
    </div>
  )
}

export default HomePage
