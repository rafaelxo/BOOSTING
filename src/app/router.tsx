import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { PageLoader } from '@/components/ui/Spinner'

// Layouts
import { PublicLayout } from '@/features/public/PublicLayout'
import { CustomerLayout } from '@/features/customer/CustomerLayout'
import { BoosterLayout } from '@/features/booster/BoosterLayout'
import { AdminLayout } from '@/features/admin/AdminLayout'

// Public pages
import { HomePage } from '@/features/public/pages/HomePage'
import { ServicesPage } from '@/features/public/pages/ServicesPage'
import { PricingPage } from '@/features/public/pages/PricingPage'
import { SecurityPage } from '@/features/public/pages/SecurityPage'
import { FAQPage } from '@/features/public/pages/FAQPage'
import { ReviewsPage } from '@/features/public/pages/ReviewsPage'
import { BoosterApplyPage } from '@/features/public/pages/BoosterApplyPage'

// Auth pages
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'

// Customer pages
import { CustomerDashboard } from '@/features/customer/pages/Dashboard'
import { OrderBuilderPage } from '@/features/customer/pages/OrderBuilder'
import { OrderDetailPage } from '@/features/customer/pages/OrderDetail'
import { OrderHistoryPage } from '@/features/customer/pages/OrderHistory'
import { CustomerProfilePage } from '@/features/customer/pages/Profile'
import { SupportPage } from '@/features/customer/pages/Support'
import { TicketDetailPage } from '@/features/customer/pages/TicketDetail'

// Booster pages
import { BoosterDashboard } from '@/features/booster/pages/Dashboard'
import { AvailableJobsPage } from '@/features/booster/pages/AvailableJobs'
import { JobDetailPage } from '@/features/booster/pages/JobDetail'
import { BoosterEarningsPage } from '@/features/booster/pages/Earnings'
import { BoosterProfilePage } from '@/features/booster/pages/Profile'
import { BoosterOnboardingPage } from '@/features/booster/pages/Onboarding'

// Admin pages
import { AdminOverview } from '@/features/admin/pages/Overview'
import { AdminOrdersPage } from '@/features/admin/pages/Orders'
import { AdminOrderDetailPage } from '@/features/admin/pages/OrderDetail'
import { AdminBoostersPage } from '@/features/admin/pages/Boosters'
import { AdminBoosterDetailPage } from '@/features/admin/pages/BoosterDetail'
import { AdminCustomersPage } from '@/features/admin/pages/Customers'
import { AdminPaymentsPage } from '@/features/admin/pages/Payments'
import { AdminRefundsPage } from '@/features/admin/pages/Refunds'
import { AdminTicketsPage } from '@/features/admin/pages/Tickets'
import { AdminAuditPage } from '@/features/admin/pages/AuditLogs'
import { AdminServicesPage } from '@/features/admin/pages/Services'
import { AdminReviewsPage } from '@/features/admin/pages/Reviews'

// Route guards
function RequireAuth({ role }: { role?: 'customer' | 'booster' | 'admin' | 'support' }) {
  const { isAuthenticated, profile, isLoading, isInitialized } = useAuthStore()

  if (!isInitialized || isLoading) return <PageLoader />
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  if (!profile) return <PageLoader />

  if (role && profile.role !== role) {
    // Redirect to correct portal
    if (profile.role === 'admin' || profile.role === 'support') return <Navigate to="/admin" replace />
    if (profile.role === 'booster') return <Navigate to="/booster" replace />
    if (profile.role === 'customer') return <Navigate to="/dashboard" replace />
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function RequireGuest() {
  const { isAuthenticated, profile, isLoading, isInitialized } = useAuthStore()

  if (!isInitialized || isLoading) return <PageLoader />
  if (isAuthenticated()) {
    if (profile?.role === 'admin' || profile?.role === 'support') return <Navigate to="/admin" replace />
    if (profile?.role === 'booster') return <Navigate to="/booster" replace />
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export const router = createBrowserRouter([
  // Public routes
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/services', element: <ServicesPage /> },
      { path: '/pricing', element: <PricingPage /> },
      { path: '/security', element: <SecurityPage /> },
      { path: '/faq', element: <FAQPage /> },
      { path: '/reviews', element: <ReviewsPage /> },
      { path: '/apply', element: <BoosterApplyPage /> },
    ],
  },

  // Auth routes (guest only)
  {
    element: <RequireGuest />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },

  // Customer routes
  {
    element: <RequireAuth role="customer" />,
    children: [
      {
        element: <CustomerLayout />,
        children: [
          { path: '/dashboard', element: <CustomerDashboard /> },
          { path: '/orders/new', element: <OrderBuilderPage /> },
          { path: '/orders/:id', element: <OrderDetailPage /> },
          { path: '/orders', element: <OrderHistoryPage /> },
          { path: '/support', element: <SupportPage /> },
          { path: '/support/:id', element: <TicketDetailPage /> },
          { path: '/profile', element: <CustomerProfilePage /> },
        ],
      },
    ],
  },

  // Booster routes
  {
    element: <RequireAuth role="booster" />,
    children: [
      {
        element: <BoosterLayout />,
        children: [
          { path: '/booster', element: <BoosterDashboard /> },
          { path: '/booster/jobs', element: <AvailableJobsPage /> },
          { path: '/booster/jobs/:id', element: <JobDetailPage /> },
          { path: '/booster/earnings', element: <BoosterEarningsPage /> },
          { path: '/booster/profile', element: <BoosterProfilePage /> },
          { path: '/booster/onboarding', element: <BoosterOnboardingPage /> },
        ],
      },
    ],
  },

  // Admin routes
  {
    element: <RequireAuth role="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin', element: <AdminOverview /> },
          { path: '/admin/orders', element: <AdminOrdersPage /> },
          { path: '/admin/orders/:id', element: <AdminOrderDetailPage /> },
          { path: '/admin/boosters', element: <AdminBoostersPage /> },
          { path: '/admin/boosters/:id', element: <AdminBoosterDetailPage /> },
          { path: '/admin/customers', element: <AdminCustomersPage /> },
          { path: '/admin/payments', element: <AdminPaymentsPage /> },
          { path: '/admin/refunds', element: <AdminRefundsPage /> },
          { path: '/admin/tickets', element: <AdminTicketsPage /> },
          { path: '/admin/audit', element: <AdminAuditPage /> },
          { path: '/admin/services', element: <AdminServicesPage /> },
          { path: '/admin/reviews', element: <AdminReviewsPage /> },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/" replace /> },
])
