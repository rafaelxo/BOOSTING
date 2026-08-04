import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Plus, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse'
import { Avatar, LogoMark } from '@/components/ui'
import { UserProfilePanel } from '@/components/UserProfilePanel'
import { NotificationBell } from '@/components/NotificationBell'

export function CustomerLayout() {
  const { pathname } = useLocation()
  const { profile } = useAuthStore()
  const { t } = useTranslation()
  const [panelOpen, setPanelOpen] = useState(false)
  const { collapsed, toggle } = useSidebarCollapse('customer')

  const NAV_ITEMS = [
    { href: '/dashboard',  icon: LayoutDashboard, label: t('customer.nav.dashboard') },
    { href: '/orders/new', icon: Plus,            label: t('customer.nav.newOrder')   },
    { href: '/orders',     icon: ShoppingBag,     label: t('customer.nav.myOrders')   },
  ]

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className={cn(
        'hidden md:flex flex-col border-r border-bg-elevated bg-bg-surface/80 backdrop-blur-md shrink-0 transition-all duration-200',
        collapsed ? 'w-[76px]' : 'w-64',
      )}>
        {/* Logo */}
        <div className={cn('h-[68px] flex items-center border-b border-bg-elevated shrink-0', collapsed ? 'justify-center px-0' : 'px-6')}>
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <LogoMark className="h-8 w-8 shrink-0" />
            {!collapsed && (
              <span className="font-bold text-ink truncate">
                Elo<span className="text-brand">Peak</span>
              </span>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href) && !pathname.startsWith('/orders/new'))
            return (
              <Link
                key={href}
                to={href}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  collapsed ? 'justify-center px-2' : 'px-3',
                  active
                    ? 'bg-brand/15 text-brand border border-brand/20'
                    : 'text-ink-secondary hover:text-ink hover:bg-bg-elevated border border-transparent',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Recolher/expandir -- preferência persistida por painel (localStorage,
            ver useSidebarCollapse). Libera espaço pro conteúdo principal, que
            já cresce sozinho via flex-1 no container ao lado. */}
        <div className="p-3 border-t border-bg-elevated shrink-0">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" /> : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
                <span className="text-xs font-medium">Recolher</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-[68px] flex items-center justify-between px-6 border-b border-bg-elevated bg-bg-surface/80 backdrop-blur-md shrink-0">
          {/* Mobile logo */}
          <Link to="/" className="md:hidden flex items-center gap-2">
            <LogoMark className="h-7 w-7" />
            <span className="font-bold text-ink text-sm">Elo<span className="text-brand">Peak</span></span>
          </Link>
          <div className="hidden md:block" />

          <div className="flex items-center gap-3">
            <NotificationBell />
            {/* Avatar — opens profile panel */}
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-full hover:ring-2 hover:ring-brand/40 transition-all"
            >
              <Avatar src={profile?.avatar_url} name={profile?.username} size="sm" />
            </button>
          </div>
        </header>

        {/* Content — largura padronizada pra toda página do painel do cliente
            herdar exatamente o mesmo tamanho, em vez de cada página escolher
            o próprio max-w. Com a sidebar recolhida, o teto cresce junto --
            sem isso, o espaço liberado pelo recolhimento virava só margem
            em branco dos dois lados em vez de ser aproveitado pelo conteúdo. */}
        <main className="flex-1 overflow-auto p-6 lg:p-9">
          <div className={cn('mx-auto w-full transition-all duration-200', collapsed ? 'max-w-[1600px]' : 'max-w-7xl')}>
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden border-t border-bg-elevated bg-bg-surface/90 backdrop-blur-xl flex shrink-0">
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
