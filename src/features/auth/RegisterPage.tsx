import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Zap, Mail, Lock, User } from 'lucide-react'
import { Button, Input, FormField, LanguageToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

const schema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username must be 24 characters or less')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const isBooster = searchParams.get('role') === 'booster'
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          username: data.username,
          role: isBooster ? 'booster' : 'customer',
        },
      },
    })

    if (error) {
      setServerError(error.message)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="w-full max-w-sm text-center card p-8 space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto">
            <span className="text-2xl">✉️</span>
          </div>
          <h2 className="text-xl font-bold text-ink">{t('auth.register.successTitle')}</h2>
          <p className="text-sm text-ink-secondary">{t('auth.register.successDesc')}</p>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/login">{t('auth.register.backToLogin')}</Link>
          </Button>
        </div>
      </div>
    )
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
            <h1 className="text-xl font-bold text-ink">
              {isBooster ? t('auth.register.titleBooster') : t('auth.register.titleCustomer')}
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              {isBooster ? t('auth.register.subtitleBooster') : t('auth.register.subtitleCustomer')}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label={t('auth.register.username')} error={errors.username?.message} required>
              <Input
                placeholder="your_username"
                leftElement={<User className="h-4 w-4" />}
                error={!!errors.username}
                autoComplete="username"
                {...register('username')}
              />
            </FormField>

            <FormField label={t('auth.register.email')} error={errors.email?.message} required>
              <Input
                type="email"
                placeholder="you@example.com"
                leftElement={<Mail className="h-4 w-4" />}
                error={!!errors.email}
                autoComplete="email"
                {...register('email')}
              />
            </FormField>

            <FormField label={t('auth.register.password')} error={errors.password?.message} required>
              <Input
                type="password"
                placeholder="••••••••"
                leftElement={<Lock className="h-4 w-4" />}
                error={!!errors.password}
                autoComplete="new-password"
                {...register('password')}
              />
            </FormField>

            <FormField label={t('auth.register.confirmPassword')} error={errors.confirmPassword?.message} required>
              <Input
                type="password"
                placeholder="••••••••"
                leftElement={<Lock className="h-4 w-4" />}
                error={!!errors.confirmPassword}
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
            </FormField>

            {serverError && (
              <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{serverError}</p>
            )}

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {isBooster ? t('auth.register.submitBooster') : t('auth.register.submitCustomer')}
            </Button>
          </form>

          <p className="text-xs text-ink-muted text-center">
            {t('auth.register.termsPrefix')}{' '}
            <Link to="/terms" className="text-brand hover:underline">{t('auth.register.termsLink')}</Link>
            {' '}{t('auth.register.and')}{' '}
            <Link to="/privacy" className="text-brand hover:underline">{t('auth.register.privacyLink')}</Link>.
          </p>
        </div>

        <p className="text-center text-sm text-ink-secondary mt-4">
          {t('auth.register.hasAccount')}{' '}
          <Link to="/login" className="text-brand font-medium hover:underline">
            {t('auth.register.signIn')}
          </Link>
        </p>

        {!isBooster && (
          <p className="text-center text-sm text-ink-secondary mt-2">
            {t('auth.register.wantToBoost')}{' '}
            <Link to="/register?role=booster" className="text-accent font-medium hover:underline">
              {t('auth.register.applyHere')}
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
