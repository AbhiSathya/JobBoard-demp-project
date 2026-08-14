import { useMemo, type ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { ToastProvider, useToast } from './components/ui/Toast'
import { ApiError } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { ForgotPasswordPage } from './pages/ForgotPassword'
import { ResetPasswordPage } from './pages/ResetPassword'
import { VerifyEmailPage } from './pages/VerifyEmail'
import { JobsPage } from './pages/candidate/Jobs'
import { JobDetailPage } from './pages/candidate/JobDetail'
import { MatchPage } from './pages/candidate/Match'
import { ProfilePage } from './pages/candidate/Profile'
import { MyApplicationsPage } from './pages/candidate/MyApplications'
import { AdminDashboardPage } from './pages/admin/Dashboard'
import { AdminJobsPage } from './pages/admin/Jobs'
import { AdminJobFormPage } from './pages/admin/JobForm'
import { AdminJobApplicationsPage } from './pages/admin/JobApplications'

function Home() {
  const { user, restoring } = useAuth()
  if (restoring) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/jobs'} replace />
}

/**
 * Every mutation failure becomes a toast here rather than at each call site, so a
 * new mutation cannot be added that fails silently. Individual mutations opt out
 * with `meta: { silent: true }` when they render the error inline instead.
 */
function QueryProvider({ children }: { children: ReactNode }) {
  const { show } = useToast()

  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false } },
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.silent) return
            const isApi = error instanceof ApiError
            show({
              intent: isApi && error.status >= 500 ? 'error' : isApi && error.status < 500 ? 'warning' : 'error',
              message: isApi ? error.message : 'Something went wrong.',
              detail: isApi && error.requestId ? `Reference ${error.requestId}` : undefined,
            })
          },
        }),
      }),
    [show],
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const candidateRoutes = [
  { path: 'jobs', element: <JobsPage /> },
  { path: 'jobs/:jobId', element: <JobDetailPage /> },
  { path: 'match', element: <MatchPage /> },
  { path: 'profile', element: <ProfilePage /> },
  { path: 'applications', element: <MyApplicationsPage /> },
]

const adminRoutes = [
  { path: 'admin', element: <AdminDashboardPage />, index: true },
  { path: 'admin/jobs', element: <AdminJobsPage /> },
  { path: 'admin/jobs/new', element: <AdminJobFormPage /> },
  { path: 'admin/jobs/:jobId/edit', element: <AdminJobFormPage /> },
  { path: 'admin/jobs/:jobId/applications', element: <AdminJobApplicationsPage /> },
]

function App() {
  return (
    <ToastProvider>
      <QueryProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />

              <Route path="/" element={<AppShell />}>
                <Route index element={<Home />} />
                {candidateRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<ProtectedRoute role="candidate">{route.element}</ProtectedRoute>}
                  />
                ))}
                {adminRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<ProtectedRoute role="admin">{route.element}</ProtectedRoute>}
                  />
                ))}
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryProvider>
    </ToastProvider>
  )
}

export default App
