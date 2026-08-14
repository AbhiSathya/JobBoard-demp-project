import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Button } from '../ui/Button'

const candidateLinks = [
  { to: '/jobs', label: 'Browse Jobs' },
  { to: '/match', label: 'AI Match' },
  { to: '/applications', label: 'My Applications' },
  { to: '/profile', label: 'Profile' },
]

const adminLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/jobs', label: 'Jobs' },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const links = user?.role === 'admin' ? adminLinks : candidateLinks

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <span className="text-base font-semibold tracking-tight text-slate-900">Job Board</span>
            <nav className="flex flex-wrap items-center gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/admin'}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <p className="font-medium text-slate-800">{user?.email}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {user?.role === 'admin' ? user.company_name : 'Candidate'}
              </p>
            </div>
            <Button variant="secondary" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
