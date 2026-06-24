import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, DollarSign,
  User, Bell, Wrench, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { Avatar, LogoMark, ThemeToggle } from '@/components/ui'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UserProfilePanel } from '@/components/UserProfilePanel'

export function BoosterLayout() {
  const { pathname } = useLocation()
  const { profile } = useAuthStore()
  const [panelOpen, setPanelOpen] = useState(false)
  const { t } = useTranslation()

  const NAV_ITEMS = [
    { href: '/booster',           icon: LayoutDashboard, label: t('booster.nav.dashboard')  },
    { href: '/booster/jobs',      icon: Briefcase,       label: t('booster.nav.jobs')        },
    { href: '/booster/earnings',  icon: DollarSign,      label: t('booster.nav.earnings')    },
    { href: '/booster/services',  icon: Wrench,          label: 'Meus Serviços'              },
    { href: '/booster/profile',   icon: User,            label: t('booster.nav.profile')     },
  ]

  const { data: boosterProfile, isLoading } = useQuery({
    queryKey: ['booster-profile', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booster_profiles')
        .select('status, display_name')
        .eq('user_id', profile!.id)
        .maybeSingle()
      return data
    },
    enabled: !!profile?.id,
  })

  // Still loading — wait
  if (isLoading) return null

  // No profile yet → go to onboarding to create it
  if (!boosterProfile && pathname !== '/booster/onboarding') {
    return <Navigate to="/booster/onboarding" replace />
  }

  const isPending = boosterProfile?.status === 'pending' || boosterProfile?.status === 'under_review'
  const isRejected = boosterProfile?.status === 'rejected'

  // Common app shell (header only for restricted states)
  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <header className="h-[68px] flex items-center justify-between px-6 border-b border-bg-elevated bg-bg-surface shrink-0">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8 shrink-0" />
          <span className="font-bold text-ink">Elo<span className="text-brand">Peak</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setPanelOpen(true)}
            className="rounded-full hover:ring-2 hover:ring-brand/40 transition-all"
          >
            <Avatar src={profile?.avatar_url} name={profile?.username} size="sm" />
          </button>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">{content}</main>
      <UserProfilePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  )

  // Pending / under review → waiting screen only (no panel access)
  if (isPending && pathname !== '/booster/onboarding') {
    return shell(
      <div className="max-w-sm text-center space-y-5">
        <div className="h-16 w-16 rounded-full bg-warning/10 border border-warning/25 flex items-center justify-center mx-auto">
          <Clock className="h-8 w-8 text-warning" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink mb-2">Candidatura em análise</h2>
          <p className="text-sm text-ink-secondary leading-relaxed">
            Nossa equipe está revisando sua candidatura. Você receberá acesso ao painel
            assim que for aprovado — em até <strong className="text-ink">2–5 dias úteis</strong>.
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          Dúvidas? Fale conosco no Discord:{' '}
          <a href="https://discord.gg/elopeak" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
            discord.gg/elopeak
          </a>
        </p>
      </div>
    )
  }

  // Rejected → show rejection screen
  if (isRejected) {
    return shell(
      <div className="max-w-sm text-center space-y-5">
        <div className="h-16 w-16 rounded-full bg-danger/10 border border-danger/25 flex items-center justify-center mx-auto">
          <span className="text-2xl font-black text-danger">×</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink mb-2">Candidatura não aprovada</h2>
          <p className="text-sm text-ink-secondary leading-relaxed">
            Infelizmente sua candidatura não foi aprovada desta vez. Entre em contato
            com o suporte para mais informações ou para recorrer da decisão.
          </p>
        </div>
        <a
          href="https://discord.gg/elopeak"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-brand font-semibold hover:underline"
        >
          Contatar suporte
        </a>
      </div>
    )
  }

  // Approved — full panel
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
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="p-2.5 rounded-xl text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-colors">
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setPanelOpen(true)}
              className="rounded-full hover:ring-2 hover:ring-brand/40 transition-all"
            >
              <Avatar src={profile?.avatar_url} name={profile?.username} size="sm" online />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <UserProfilePanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  )
}
