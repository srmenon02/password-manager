import { useNavigate } from 'react-router-dom'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'
import {
  heroAction,
  heroLabel,
  outlinedAction,
} from '@/components/controlStyles'

function NotFoundPage() {
  usePageMeta('Page Not Found · cipher', "The page you're looking for doesn't exist.")
  const navigate = useNavigate()

  return (
    <div className="bg-paper text-on-surface font-body-md min-h-screen flex flex-col">
      <AppHeader
        nav={[
          { label: 'Login', to: '/login' },
          { label: 'Create Account', to: '/register' },
        ]}
      />

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
            <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink font-bold tracking-tighter leading-tight">
              This page slipped<br />out of the vault.
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto md:mx-0">
              We couldn't find what you were looking for. It may have been moved, renamed, or never existed in the first place.
            </p>
            <div className="flex flex-wrap items-center gap-6 pt-4 justify-center md:justify-start">
              <button className={heroAction} onClick={() => navigate('/')}>
                <span className={heroLabel}>Back to safety</span>
              </button>
              <button
                className={`${outlinedAction} px-8`}
                onClick={() => navigate(-1)}
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default NotFoundPage
