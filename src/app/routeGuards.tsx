import { Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { PageLoader } from '@/components/ui/Spinner'

export function SuspensePage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export function RequireAuth({ role }: { role?: 'customer' | 'booster' | 'admin' | 'support' }) {
  const { isAuthenticated, profile, isLoading, isInitialized } = useAuthStore()
  const location = useLocation()

  if (!isInitialized || isLoading) return <PageLoader />
  if (!isAuthenticated()) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  if (!profile) return <PageLoader />

  // `support` has admin-panel access at the DB level (is_admin() treats
  // them the same) — without this, a support profile hitting a
  // role="admin" route gets redirected to /admin, which is itself gated by
  // the same role="admin" check, looping forever.
  const effectiveRole = profile.role === 'support' ? 'admin' : profile.role

  if (role && effectiveRole !== role) {
    if (effectiveRole === 'admin') return <Navigate to="/admin" replace />
    if (profile.role === 'booster') return <Navigate to="/booster" replace />
    if (profile.role === 'customer') return <Navigate to="/dashboard" replace />
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function RequireGuest() {
  const { isAuthenticated, profile, isLoading, isInitialized } = useAuthStore()

  if (!isInitialized || isLoading) return <PageLoader />
  if (isAuthenticated()) {
    if (profile?.role === 'admin' || profile?.role === 'support') return <Navigate to="/admin" replace />
    if (profile?.role === 'booster') return <Navigate to="/booster" replace />
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
