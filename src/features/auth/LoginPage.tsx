import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Zap, Mail, Lock } from 'lucide-react'
import { Button, Input, FormField, LanguageToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

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

    navigate('/dashboard')
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
