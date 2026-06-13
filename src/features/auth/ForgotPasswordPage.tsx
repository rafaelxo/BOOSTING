import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Zap, Mail } from 'lucide-react'
import { Button, Input, FormField } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="w-full max-w-sm text-center card p-8 space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto">
            <Mail className="h-7 w-7 text-success" />
          </div>
          <h2 className="text-xl font-bold text-ink">Check your inbox</h2>
          <p className="text-sm text-ink-secondary">We sent a password reset link to your email address.</p>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-brand">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-ink">Elo<span className="text-brand">Peak</span></span>
        </Link>

        <div className="card p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-ink">Reset password</h1>
            <p className="text-sm text-ink-secondary mt-1">We'll email you a reset link.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Email" error={errors.email?.message} required>
              <Input
                type="email"
                placeholder="you@example.com"
                leftElement={<Mail className="h-4 w-4" />}
                error={!!errors.email}
                {...register('email')}
              />
            </FormField>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Send Reset Link
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-ink-secondary mt-4">
          <Link to="/login" className="text-brand font-medium hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
