import { Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Briefcase, ClipboardList, Wrench, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { UserAccountBadge } from '@/components/UserAccountBadge'
import { useBoosterStatus } from '@/features/booster/hooks/useBoosterStatus'
import { PendingScreen, RejectedScreen, NoApplicationScreen, BoosterStatusErrorScreen } from '@/features/booster/components/BoosterStatusScreens'

// Ordem fixa exigida pelo produto: Painel, Jobs, Pedidos, Serviços, Contas.
// Não existe item de "Meu Perfil" — dados pessoais ficam só no popover do
// UserAccountBadge, dados profissionais ficam em Serviços.
export function BoosterLayout() {
  const { pathname } = useLocation()
  const { t } = useTranslation()

  const NAV_ITEMS = [
    { href: '/booster',          icon: LayoutDashboard, label: t('booster.nav.dashboard') },
    { href: '/booster/jobs',     icon: Briefcase,        label: t('booster.nav.jobs')      },
    { href: '/booster/orders',   icon: ClipboardList,    label: t('booster.nav.orders')    },
    { href: '/booster/services', icon: Wrench,           label: t('booster.nav.services')  },
    { href: '/booster/accounts', icon: Landmark,         label: t('booster.nav.accounts')  },
  ]

  const { state } = useBoosterStatus()
  // /booster/onboarding renders its own form/redirect logic and must always
  // reach the full panel shell below, regardless of application status.
  const isOnboardingRoute = pathname === '/booster/onboarding'

  // Still loading — wait
  if (state === 'loading') return null

  // Common app shell (header only for restricted states)
  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <header className="h-[68px] flex items-center justify-between px-6 border-b border-bg-elevated bg-bg-surface shrink-0">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8 shrink-0" />
          <span className="font-bold text-ink">Elo<span className="text-brand">Peak</span></span>
        </Link>
        <UserAccountBadge showNotifications={false} />
      </header>
      <main className="flex-1 flex items-center justify-center p-6">{content}</main>
    </div>
  )

  if (!isOnboardingRoute) {
    if (state === 'no_application') return shell(<NoApplicationScreen />)
    if (state === 'pending') return shell(<PendingScreen />)
    if (state === 'rejected') return shell(<RejectedScreen />)
    if (state === 'error') return shell(<BoosterStatusErrorScreen />)
  }

  // Approved (or /booster/onboarding, which handles its own status logic) — full panel
  return (
    <div className="min-h-screen flex bg-bg-base">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-bg-elevated bg-bg-surface shrink-0">
        <div className="h-[68px] flex items-center px-6 border-b border-bg-elevated gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 flex-1 min-w-0">
            <LogoMark className="h-8 w-8 shrink-0" />
            <span className="font-bold text-ink truncate">Elo<span className="text-brand">Peak</span></span>
          </Link>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success/15 text-success border border-success/25 shrink-0">
            {t('booster.nav.role')}
          </span>
        </div>

        <nav className="flex-1 px-4 py-5 space-y-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/booster' && pathname.startsWith(href))
            return (
              <Link
                key={label}
                to={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-brand/15 text-brand border border-brand/20'
                    : 'text-ink-secondary hover:text-ink hover:bg-bg-elevated border border-transparent'
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[68px] flex items-center justify-between px-6 border-b border-bg-elevated bg-bg-surface shrink-0">
          <div className="md:hidden font-bold text-ink">Elo<span className="text-brand">Peak</span></div>
          <div className="hidden md:block" />
          <UserAccountBadge online />
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </main>

        <nav className="md:hidden border-t border-bg-elevated bg-bg-surface flex shrink-0" aria-label="Navegação do booster">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/booster' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-3 text-[10px] font-semibold',
                  active ? 'text-brand' : 'text-ink-muted',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="w-full truncate text-center">{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
