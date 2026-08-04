import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Users, DollarSign,
  Shield,
  RefreshCw, AlertTriangle, Landmark, Banknote, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { UserAccountBadge } from '@/components/UserAccountBadge'
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse'

export function AdminLayout() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const { collapsed, toggle } = useSidebarCollapse('admin')

  const NAV_SECTIONS = [
    {
      label: t('admin.nav.operations'),
      items: [
        { href: '/admin',           icon: LayoutDashboard, label: t('admin.nav.overview')   },
        { href: '/admin/orders',    icon: ShoppingBag,     label: t('admin.nav.orders')     },
        { href: '/admin/boosters',  icon: Shield,          label: t('admin.nav.boosters')   },
        { href: '/admin/customers', icon: Users,           label: t('admin.nav.customers')  },
        { href: '/admin/drops',     icon: AlertTriangle,   label: 'Drops'                   },
        { href: '/admin/duo-accounts', icon: Landmark,     label: 'Contas Duo'              },
      ],
    },
    {
      label: t('admin.nav.finance'),
      items: [
        { href: '/admin/payments', icon: DollarSign, label: t('admin.nav.payments') },
        { href: '/admin/payouts',  icon: Banknote,    label: 'Saques' },
        { href: '/admin/refunds',  icon: RefreshCw,  label: t('admin.nav.refunds')  },
      ],
    },
  ]
  const navItems = NAV_SECTIONS.flatMap(section => section.items)
  const isActive = (href: string) => pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className={cn(
        'hidden lg:flex flex-col border-r border-bg-elevated bg-bg-surface/80 backdrop-blur-md shrink-0 transition-all duration-200',
        collapsed ? 'w-[76px]' : 'w-64',
      )}>
        {/* Logo */}
        <div className={cn('h-[68px] flex items-center border-b border-bg-elevated gap-3 shrink-0', collapsed ? 'justify-center px-0' : 'px-6')}>
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <LogoMark className="h-8 w-8 shrink-0" />
            {!collapsed && (
              <span className="font-bold text-ink truncate">
                Elo<span className="text-brand">Peak</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-danger/15 text-danger border border-danger/25 shrink-0 uppercase tracking-wide">
              {t('admin.nav.role')}
            </span>
          )}
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              {!collapsed && <p className="section-label px-3 mb-2">{label}</p>}
              <div className="space-y-0.5">
                {items.map(({ href, icon: Icon, label: itemLabel }) => {
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      to={href}
                      title={collapsed ? itemLabel : undefined}
                      className={cn(
                        'flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                        collapsed ? 'justify-center px-2' : 'px-3',
                        active
                          ? 'bg-brand/15 text-brand border border-brand/20'
                          : 'text-ink-secondary hover:text-ink hover:bg-bg-elevated border border-transparent'
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{itemLabel}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

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
        <header className="h-[68px] flex items-center justify-between px-6 border-b border-bg-elevated bg-bg-surface/80 backdrop-blur-md shrink-0">
          <p className="text-sm text-ink-muted font-medium">{t('admin.nav.panel')}</p>
          <UserAccountBadge />
        </header>

        <nav className="lg:hidden overflow-x-auto border-b border-bg-elevated bg-bg-surface/90 backdrop-blur-xl shrink-0" aria-label="Navegação administrativa">
          <div className="flex min-w-max gap-1 px-3 py-2">
            {navItems.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium',
                  isActive(href) ? 'bg-brand/15 text-brand' : 'text-ink-secondary hover:bg-bg-elevated hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Largura padronizada — mesma régua do painel de cliente e booster.
            Com a sidebar recolhida, o teto cresce junto pra aproveitar o
            espaço liberado em vez de deixar como margem em branco. */}
        <main className="flex-1 overflow-auto p-6 lg:p-9">
          <div className={cn('mx-auto w-full transition-all duration-200', collapsed ? 'max-w-[1600px]' : 'max-w-7xl')}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
