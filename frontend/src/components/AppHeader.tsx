import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { NavItem } from './navItems'

type AppHeaderProps = {
  nav?: NavItem[]
  navLabel?: string
  action?: ReactNode
}

const NAV_ITEM = 'inline-flex items-center min-h-11 border-b-2 transition-colors duration-200'

export default function AppHeader({ nav = [], navLabel = 'Main', action }: AppHeaderProps) {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-50 w-full bg-paper border-b border-surface-dim">
      <div className="flex flex-wrap items-center px-gutter">
        <Link
          to="/"
          className="inline-flex items-center min-h-14 md:min-h-16 font-headline-md text-headline-md text-primary tracking-tighter hover:opacity-75 transition-opacity"
        >
          cipher
        </Link>

        {nav.length > 0 && (
          // Second row on mobile so the links never wrap into a ragged block; the row
          // scrolls instead of collapsing behind a menu, keeping the current section visible.
          <nav
            aria-label={navLabel}
            className="nav-scroll order-last w-[calc(100%+48px)] -mx-gutter px-gutter flex items-center gap-x-6 overflow-x-auto whitespace-nowrap border-t border-surface-dim font-body-md text-body-md md:order-none md:w-auto md:mx-0 md:px-0 md:ml-auto md:gap-8 md:overflow-visible md:border-t-0"
          >
            {nav.map((item) =>
              item.to === pathname ? (
                <span key={item.to} aria-current="page" className={`${NAV_ITEM} border-ink text-ink`}>
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`${NAV_ITEM} border-transparent text-on-surface-variant hover:text-primary hover:border-outline-variant`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
        )}

        {action && (
          <div className="ml-auto pl-4 inline-flex items-center min-h-14 md:min-h-16 md:ml-0 md:pl-12">{action}</div>
        )}
      </div>
    </header>
  )
}
