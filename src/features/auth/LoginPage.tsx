import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Zap, Mail, Lock } from 'lucide-react'
import { Button, Input, FormField, LanguageToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
    </svg>
  )
}

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)

  const [discordLoading, setDiscordLoading] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function handleDiscordLogin() {
    setDiscordLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify email guilds.join',
        redirectTo: window.location.origin,
      },
    })
    if (error) {
      setServerError(error.message)
      setDiscordLoading(false)
    }
  }

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setServerError(error.message === 'Invalid login credentials'
        ? t('auth.login.invalidCredentials')
        : error.message)
      return
    }

    const raw = searchParams.get('redirect')
    let target = '/dashboard'
    if (raw) {
      try {
        const decoded = decodeURIComponent(raw)
        if (/^\/(?![/\\])/.test(decoded)) target = decoded
      } catch { /* ignore malformed */ }
    }
    navigate(target)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-brand">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-ink">
              Elo<span className="text-brand">Peak</span>
            </span>
          </Link>
          <LanguageToggle />
        </div>

        <div className="card p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-ink">{t('auth.login.title')}</h1>
            <p className="text-sm text-ink-secondary mt-1">{t('auth.login.subtitle')}</p>
          </div>

          {/* Discord — primary method */}
          <button
            type="button"
            onClick={handleDiscordLogin}
            disabled={discordLoading || isSubmitting}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: '#5865F2' }}
          >
            <DiscordIcon className="h-5 w-5" />
            {discordLoading ? t('auth.login.discordLoading') : t('auth.login.discordLogin')}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-bg-elevated" />
            <span className="text-xs text-ink-muted">{t('auth.login.orEmail')}</span>
            <div className="flex-1 h-px bg-bg-elevated" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label={t('auth.login.email')} error={errors.email?.message} required>
              <Input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                leftElement={<Mail className="h-4 w-4" />}
                error={!!errors.email}
                {...register('email')}
              />
            </FormField>

            <FormField label={t('auth.login.password')} error={errors.password?.message} required>
              <Input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                leftElement={<Lock className="h-4 w-4" />}
                error={!!errors.password}
                {...register('password')}
              />
            </FormField>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-brand hover:underline">
                {t('auth.login.forgotPassword')}
              </Link>
            </div>

            {serverError && (
              <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{serverError}</p>
            )}

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {t('auth.login.submit')}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-ink-secondary mt-4">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="text-brand font-medium hover:underline">
            {t('auth.login.register')}
          </Link>
        </p>
      </div>
    </div>
  )
}
