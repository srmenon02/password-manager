import { Link } from 'react-router-dom'
import { usePageMeta } from '@/hooks/usePageMeta'

export default function PrivacyPolicyPage() {
  usePageMeta(
    'Privacy Policy · cipher',
    'What cipher stores, what it cannot see, and how your encrypted vault data is handled.'
  )

  return (
    <div className="bg-paper text-ink font-body-md min-h-screen flex flex-col">
      <header className="w-full min-h-16 py-2 bg-paper flex flex-wrap gap-x-4 gap-y-2 justify-between items-center px-gutter max-w-full z-50 sticky top-0 border-b border-surface-dim">
        <Link to="/" className="font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity">cipher</Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 md:gap-8">
          <Link to="/login" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Login</Link>
          <Link to="/terms" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Terms</Link>
        </nav>
      </header>

      <main className="flex-grow w-full px-margin-safe py-16 md:py-24">
        <div className="max-w-3xl mx-auto flex flex-col gap-10">

          <div>
            <h1 className="font-headline-xl-mobile md:font-headline-xl text-headline-xl-mobile md:text-headline-xl mb-4">Privacy Policy</h1>
            <p className="text-on-surface-variant">
              cipher is a zero-knowledge password manager. Encryption and decryption happen in your
              browser, and your master password is never transmitted to our servers.
            </p>
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">What the server stores</h2>
            <ul className="flex flex-col gap-3 text-on-surface-variant">
              <li><span className="text-ink">Email address</span> — stored in plaintext, used to identify your account and as an input to authentication.</li>
              <li><span className="text-ink">Authentication salt and SRP verifier</span> — derived from your master password. The verifier allows the server to confirm you know your password without ever receiving it, and cannot be used to log in as you.</li>
              <li><span className="text-ink">Your encrypted vault</span> — a single encrypted blob plus its initialization vector, along with your vault key wrapped by a key derived from your master password. The server holds only ciphertext.</li>
              <li><span className="text-ink">Sharing keys</span> — your public sharing key in plaintext, and your sharing private key only in encrypted form.</li>
              <li><span className="text-ink">Shared items</span> — encrypted item payloads, wrapped content-encryption keys, permission level, and revocation status.</li>
              <li><span className="text-ink">An activity log</span> — a hash-chained record of vault actions (action name, timestamp, and limited metadata) that lets you verify the log has not been tampered with.</li>
              <li><span className="text-ink">Breach-check results</span> — see the section below, which describes a known limitation.</li>
              <li><span className="text-ink">Timestamps</span> — account and vault creation and update times.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">What the server cannot see</h2>
            <p className="text-on-surface-variant">
              Your master password is never sent to the server in any form that can be reversed.
              Authentication uses the Secure Remote Password protocol, and your vault contents —
              site names, usernames, passwords, and notes — are encrypted in your browser with
              AES-256-GCM before ever leaving your device. Because of this, we cannot read your
              vault, and we cannot reset or recover your master password. If you lose it, your vault
              cannot be decrypted by anyone, including us.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Breach checking</h2>
            <p className="text-on-surface-variant">
              When you check whether a password has appeared in a known breach, your browser computes
              a SHA-1 hash of that password and sends only the first five characters to Have I Been
              Pwned. That service never receives the full hash or the password itself, and the
              comparison that determines the result happens entirely in your browser.
            </p>
            <p className="text-on-surface-variant">
              No password hash is ever sent to or stored on the cipher server. When breach-scan
              results are saved so they can be shown later, only the vault entry's identifier and a
              true/false verdict are recorded. Neither can be used to recover the password it refers
              to.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Third parties</h2>
            <p className="text-on-surface-variant">
              Breach checking queries Have I Been Pwned using the range API described above. No
              third-party advertising, tracking, or profiling services are embedded in this
              application, and no tracking cookies are set. The only browser storage used is the
              session token required to keep you signed in.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Retention and deletion</h2>
            <p className="text-on-surface-variant">
              Account records, vault ciphertext, shared items, breach results, and audit entries are
              retained while your account exists. Deleting your account removes the associated vault,
              shared items, breach results, and audit entries.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-headline-md text-headline-md border-b border-ink pb-3">Contact</h2>
            <p className="text-on-surface-variant">
              Questions about this policy or your data can be sent to:
            </p>
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
          <Link to="/terms" className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200">Terms</Link>
        </div>
      </footer>
    </div>
  )
}
