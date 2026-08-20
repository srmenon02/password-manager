import { Link, useNavigate } from 'react-router-dom'

function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="bg-paper text-on-surface font-body-md min-h-screen flex flex-col">
      <header className="w-full h-16 bg-paper flex justify-between items-center px-gutter max-w-full z-50 relative">
        <div className="font-headline-md text-headline-md text-primary tracking-tighter">VaultKey</div>
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/login" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Login</Link>
          <Link to="/generator" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Generator</Link>
          <Link to="/register" className="text-on-surface-variant font-body-md cursor-pointer hover:text-pink transition-colors duration-200">Create Account</Link>
        </nav>
      </header>

      <main className="flex-grow">
        <section className="w-full px-gutter pt-32 pb-40 md:pt-48 md:pb-56 relative overflow-hidden">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-16 relative z-10">
            <div className="w-full max-w-4xl mx-auto space-y-8 text-center">
              <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl text-ink font-bold tracking-tighter leading-tight text-center">
                Your logins,<br />secured.
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto">
                Zero-knowledge encryption and authentication, ensuring your secrets are both safe and accessible.
              </p>
              <div className="flex flex-wrap items-center gap-6 pt-4 justify-center">
                <button className="shine-button font-body-md px-8 py-4 uppercase tracking-wider" onClick={() => navigate('/register')}>Get Started</button>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full px-gutter py-32 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16 text-center">
              <h2 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant mb-4">How it works</h2>
              <div className="h-px w-24 bg-ink mx-auto"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8">
              <div className="flex flex-col space-y-4 pt-12 md:pt-0">
                <span className="font-label-caps text-label-caps text-on-surface-variant">01 — Client-Side Encryption</span>
                <h3 className="font-headline-md text-headline-md text-ink pb-4 border-b border-ink">Client-Side Encryption</h3>
                <p className="font-body-md text-body-md text-on-surface-variant pt-4">All encryption happens in your browser. Your master password never leaves your device.</p>
              </div>
              <div className="flex flex-col space-y-4 md:pt-24">
                <span className="font-label-caps text-label-caps text-on-surface-variant">02 — Zero-Knowledge</span>
                <h3 className="font-headline-md text-headline-md text-ink pb-4 border-b border-ink">Zero-Knowledge</h3>
                <p className="font-body-md text-body-md text-on-surface-variant pt-4">Only encrypted data is stored, ensuring that even if servers are compromised, your passwords stay safe.</p>
              </div>
              <div className="flex flex-col space-y-4 pt-12 md:pt-8">
                <span className="font-label-caps text-label-caps text-on-surface-variant">03 — SRP Authentication</span>
                <h3 className="font-headline-md text-headline-md text-ink pb-4 border-b border-ink">SRP Authentication</h3>
                <p className="font-body-md text-body-md text-on-surface-variant pt-4">Secure Remote Password protocol ensures authentication without transmitting your password.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default HomePage
