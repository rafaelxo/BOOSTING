import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Plus, HeadphonesIcon, Bell,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { Avatar, LogoMark, ThemeToggle } from '@/components/ui'
import { UserProfilePanel } from '@/components/UserProfilePanel'

export function CustomerLayout() {
  const { pathname } = useLocation()
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const [panelOpen, setPanelOpen] = useState(false)

  const NAV_ITEMS = [
    { href: '/dashboard',  icon: LayoutDashboard, label: t('customer.nav.dashboard') },
    { href: '/orders/new', icon: Plus,            label: t('customer.nav.newOrder')   },
    { href: '/orders',     icon: ShoppingBag,     label: t('customer.nav.myOrders')   },
    { href: '/support',    icon: HeadphonesIcon,  label: t('customer.nav.support')    },
  ]

  return (
    <div className="min-h-screen flex bg-bg-base">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-col border-r border-bg-elevated bg-bg-surface shrink-0">
        {/* Logo */}
        <div className="h-[68px] flex items-center px-6 border-b border-bg-elevated shrink-0">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-bold text-ink">
              Elo<span className="text-brand">Peak</span>
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-5 space-y-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href) && !pathname.startsWith('/orders/new'))
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-brand/15 text-brand border border-brand/20'
                    : 'text-ink-secondary hover:text-ink hover:bg-bg-elevated border border-transparent',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

      </aside>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-[68px] flex items-center justify-between px-6 border-b border-bg-elevated bg-bg-surface shrink-0">
          {/* Mobile logo */}
          <Link to="/" className="md:hidden flex items-center gap-2">
            <LogoMark className="h-7 w-7" />
            <span className="font-bold text-ink text-sm">Elo<span className="text-brand">Peak</span></span>
          </Link>
          <div className="hidden md:block" />

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button className="relative p-2.5 rounded-xl text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-colors">
              <Bell className="h-[18px] w-[18px]" />
            </button>
            {/* Avatar — opens profile panel */}
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-full hover:ring-2 hover:ring-brand/40 transition-all"
            >
              <Avatar src={profile?.avatar_url} name={profile?.username} size="sm" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden border-t border-bg-elevated bg-bg-surface flex shrink-0">
          {NAV_ITEMS.filter(i => i.href !== '/orders/new').map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors',
                  active ? 'text-brand' : 'text-ink-muted',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            )
          })}
          {/* Profile icon in mobile nav */}
          <button
            onClick={() => setPanelOpen(true)}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold text-ink-muted"
          >
            <Avatar src={profile?.avatar_url} name={profile?.username} size="xs" />
            Perfil
          </button>
        </nav>
      </div>

      <UserProfilePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  )
}
