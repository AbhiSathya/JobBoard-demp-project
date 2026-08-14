import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useTheme, type ThemeChoice } from '../../lib/theme'
import { useToast } from '../ui/Toast'
import { VerifyBanner } from './VerifyBanner'

interface NavItem {
  to: string
  label: string
  icon: 'search' | 'spark' | 'inbox' | 'user' | 'chart' | 'list'
  end?: boolean
}

const candidateNav: NavItem[] = [
  { to: '/jobs', label: 'Browse', icon: 'search' },
  { to: '/match', label: 'AI Match', icon: 'spark' },
  { to: '/applications', label: 'Applications', icon: 'inbox' },
  { to: '/profile', label: 'Profile', icon: 'user' },
]

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: 'chart', end: true },
  { to: '/admin/jobs', label: 'Listings', icon: 'list' },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { choice, setChoice } = useTheme()
  const { show } = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const nav = user?.role === 'admin' ? adminNav : candidateNav

  async function handleLogout() {
    await logout()
    show({ intent: 'info', message: 'Signed out' })
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-sunken lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Left rail on desktop, top bar below lg. */}
      <aside className="border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-r">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:border-b-0 lg:py-5">
          <Wordmark />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="rounded-md border border-line-strong p-1.5 text-ink-2 lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={`${menuOpen ? 'block' : 'hidden'} border-b border-line px-3 pb-4 lg:block lg:border-b-0`}>
          <nav className="flex flex-col gap-0.5 lg:mt-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* A 2px rail rather than a filled pill — quieter, and it reads
                        as position rather than as a button. */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r transition-opacity ${
                        isActive ? 'bg-accent opacity-100' : 'opacity-0'
                      }`}
                    />
                    <NavIcon name={item.icon} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 border-t border-line pt-4">
            <div className="px-3">
              <p className="truncate text-[13px] font-medium text-ink">{user?.email}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {user?.role === 'admin' ? user.company_name : 'Candidate'}
              </p>
            </div>
            <ThemeToggle choice={choice} onChange={setChoice} />
            <button
              type="button"
              onClick={handleLogout}
              className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[75rem] px-5 py-8 sm:px-8">
          <VerifyBanner />
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded bg-accent">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4.2h8M2 7.8h5" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Job Board</span>
    </span>
  )
}

function ThemeToggle({ choice, onChange }: { choice: ThemeChoice; onChange: (next: ThemeChoice) => void }) {
  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'Auto' },
    { value: 'dark', label: 'Dark' },
  ]
  return (
    <div className="mx-3 mt-3 flex rounded-md border border-line p-0.5" role="group" aria-label="Colour theme">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={choice === option.value}
          className={`flex-1 rounded px-2 py-1 text-[11px] transition-colors ${
            choice === option.value ? 'bg-sunken font-medium text-ink' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function NavIcon({ name }: { name: NavItem['icon'] }) {
  const paths: Record<NavItem['icon'], string> = {
    search: 'M7 11.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM10.4 10.4L13.5 13.5',
    spark: 'M8 2.5l1.4 3.6 3.6 1.4-3.6 1.4L8 12.5 6.6 8.9 3 7.5l3.6-1.4z',
    inbox: 'M2.5 8.5h3l1 2h3l1-2h3M2.5 8.5l1.6-5h7.8l1.6 5v4a1 1 0 01-1 1H3.5a1 1 0 01-1-1z',
    user: 'M8 8a2.6 2.6 0 100-5.2A2.6 2.6 0 008 8zM3 13.2c0-2.2 2.2-3.5 5-3.5s5 1.3 5 3.5',
    chart: 'M3 13V8M6.5 13V4M10 13v-3M13.5 13V6',
    list: 'M3 4.5h10M3 8h10M3 11.5h6',
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
