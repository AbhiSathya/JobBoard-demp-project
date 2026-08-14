import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AuthProvider, useAuth } from './lib/auth'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { JobsPage } from './pages/candidate/Jobs'
import { JobDetailPage } from './pages/candidate/JobDetail'
import { MatchPage } from './pages/candidate/Match'
import { ProfilePage } from './pages/candidate/Profile'
import { MyApplicationsPage } from './pages/candidate/MyApplications'
import { AdminDashboardPage } from './pages/admin/Dashboard'
import { AdminJobsPage } from './pages/admin/Jobs'
import { AdminJobFormPage } from './pages/admin/JobForm'
import { AdminJobApplicationsPage } from './pages/admin/JobApplications'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
})

function Home() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/jobs'} replace />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<AppShell />}>
              <Route index element={<Home />} />
              <Route
                path="jobs"
                element={
                  <ProtectedRoute role="candidate">
                    <JobsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="jobs/:jobId"
                element={
                  <ProtectedRoute role="candidate">
                    <JobDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="match"
                element={
                  <ProtectedRoute role="candidate">
                    <MatchPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="profile"
                element={
                  <ProtectedRoute role="candidate">
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="applications"
                element={
                  <ProtectedRoute role="candidate">
                    <MyApplicationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin"
                element={
                  <ProtectedRoute role="admin">
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/jobs"
                element={
                  <ProtectedRoute role="admin">
                    <AdminJobsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/jobs/new"
                element={
                  <ProtectedRoute role="admin">
                    <AdminJobFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/jobs/:jobId/edit"
                element={
                  <ProtectedRoute role="admin">
                    <AdminJobFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/jobs/:jobId/applications"
                element={
                  <ProtectedRoute role="admin">
                    <AdminJobApplicationsPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
