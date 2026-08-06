import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse'
import { Avatar, LogoMark } from '@/components/ui'
import { NotificationBell } from '@/components/NotificationBell'
import { UserProfilePanel } from '@/components/UserProfilePanel'

export interface SidebarNavItem {
  href: string
  icon: LucideIcon
  label: string
  /** Sobrescreve a detecção padrão de rota ativa (ex.: evitar colisão entre "/orders" e "/orders/new"). */
  isActive?: (pathname: string) => boolean
}

export interface SidebarNavSection {
  label?: string
  items: SidebarNavItem[]
}

interface AppSidebarProps {
  /** Escopo usado pelo useSidebarCollapse — mantém a preferência de recolher independente por painel. */
  scope: 'customer' | 'booster' | 'admin'
  sections: SidebarNavSection[]
  /** Rota do dashboard/raiz do painel — evita que o item de início fique ativo em toda sub-rota. */
  homeHref: string
  roleBadge?: { label: string; className: string }
  breakpoint?: 'md' | 'lg'
}

function defaultIsActive(pathname: string, href: string, homeHref: string): boolean {
  if (pathname === href) return true
  if (href === homeHref) return false
  return pathname.startsWith(`${href}/`)
}

/**
 * Sidebar única reaproveitada pelos painéis de cliente, booster e admin.
 * Antes cada layout duplicava essa estrutura inteira; unificar evita que o
 * toggle de recolher e o bloco de conta (avatar/username/notificações)
 * fiquem dessincronizados entre os três painéis.
 */
export function AppSidebar({ scope, sections, homeHref, roleBadge, breakpoint = 'md' }: AppSidebarProps) {
  const { pathname } = useLocation()
  const { profile } = useAuthStore()
  const { collapsed, toggle } = useSidebarCollapse(scope)
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <aside className={cn(
      'hidden flex-col border-r border-bg-elevated bg-bg-surface/80 backdrop-blur-md shrink-0 transition-all duration-200',
      breakpoint === 'lg' ? 'lg:flex' : 'md:flex',
      collapsed ? 'w-[76px]' : 'w-64',
    )}>
      {/* Topo: logo + toggle de recolher na mesma linha, em ambos os estados. */}
      <div className={cn(
        'h-[68px] flex items-center border-b border-bg-elevated shrink-0',
        collapsed ? 'justify-center gap-1 px-2' : 'justify-between px-4',
      )}>
        <Link to="/" className="flex items-center gap-2 min-w-0" title="EloPeak">
          <LogoMark className={cn('shrink-0', collapsed ? 'h-7 w-7' : 'h-8 w-8')} />
          {!collapsed && (
            <span className="font-bold text-ink truncate">
              Elo<span className="text-brand">Peak</span>
            </span>
          )}
        </Link>
        {!collapsed && roleBadge && (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 mr-1', roleBadge.className)}>
            {roleBadge.label}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="rounded-lg p-1.5 text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-colors shrink-0"
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={section.label ?? idx}>
            {!collapsed && section.label && <p className="section-label px-3 mb-2">{section.label}</p>}
            <div className="space-y-0.5">
              {section.items.map(({ href, icon: Icon, label, isActive }) => {
                const active = isActive ? isActive(pathname) : defaultIsActive(pathname, href, homeHref)
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
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé: avatar, username e notificações -- antes viviam no header,
          que foi removido da aplicação autenticada. */}
      <div className="border-t border-bg-elevated shrink-0 p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-full hover:ring-2 hover:ring-brand/40 transition-all"
              title={profile?.username ?? 'Perfil'}
            >
              <Avatar src={profile?.avatar_url} name={profile?.username} size="sm" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanelOpen(true)}
              className="flex items-center gap-2 flex-1 min-w-0 rounded-xl px-2 py-1.5 hover:bg-bg-elevated transition-colors text-left"
            >
              <Avatar src={profile?.avatar_url} name={profile?.username} size="sm" />
              <span className="text-sm font-medium text-ink truncate">{profile?.username ?? 'Usuário'}</span>
            </button>
            <NotificationBell />
          </div>
        )}
      </div>

      <UserProfilePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </aside>
  )
}
