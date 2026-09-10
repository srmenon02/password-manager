import { Link } from 'react-router-dom'
import { usePageMeta } from '@/hooks/usePageMeta'
import AppHeader from '@/components/AppHeader'

export default function TermsPage() {
  usePageMeta(
    'Terms of Service · cipher',
    'The terms covering use of cipher, including the irreversible nature of master password loss.'
  )

  return (
    <div className="bg-paper text-ink font-body-md min-h-screen flex flex-col">
      <AppHeader
        nav={[
          { label: 'Login', to: '/login' },
          { label: 'Privacy', to: '/privacy' },
        ]}
      />

      <main className="flex-grow w-full px-margin-safe py-16 md:py-24">
        <div className="max-w-3xl mx-auto flex flex-col gap-10">

          <div>
            <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl mb-4">Terms of Service</h1>
            <p className="text-on-surface-variant">
              By creating a cipher account you agree to the terms below. Please read the section on
              master password loss carefully — it describes a limitation that cannot be undone.
            </p>
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Your master password cannot be recovered</h2>
            <p className="text-on-surface-variant">
              cipher encrypts your vault in your browser using a key derived from your master
              password. That password is never transmitted to or stored by us in any recoverable
              form. As a direct consequence, we cannot reset it, recover it, or decrypt your vault on
              your behalf. If you forget your master password, the contents of your vault are
              permanently unreadable. You are solely responsible for retaining it.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Your responsibilities</h2>
            <ul className="flex flex-col gap-3 text-on-surface-variant">
              <li>Choose a strong, unique master password and keep it confidential.</li>
              <li>Keep the device and browser you use to access cipher secure, since decryption happens there.</li>
              <li>Share vault items only with recipients you intend to share them with. A shared item can be revoked, but you should assume a recipient may have already read or copied its contents.</li>
              <li>Use the service lawfully, and do not attempt to access other users' accounts or data.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Service provided as-is</h2>
            <p className="text-on-surface-variant">
              cipher is provided without warranty of any kind. While the service is built so that
              we cannot read your vault contents, no software is free of defects, and you should
              maintain your own backups of information you cannot afford to lose.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Account termination</h2>
            <p className="text-on-surface-variant">
              You may stop using the service at any time. We may suspend accounts that are used
              unlawfully or in a way that threatens the integrity of the service. On termination,
              your encrypted vault and associated records are removed.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Changes to these terms</h2>
            <p className="text-on-surface-variant">
              These terms may be updated as the service changes. Continued use after an update
              constitutes acceptance of the revised terms.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Contact</h2>
            <p className="border border-taupe bg-surface-container-low p-4">
              Suraj Menon<br />
              2225 Treehouse Lane 211 Corona CA 92879<br />
              srmenon02@gmail.com
            </p>
          </section>
        </div>
      </main>

      <footer className="w-full border-t border-taupe px-gutter py-12">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Home</Link>
          <Link to="/privacy" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}
