import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function BoosterApplyPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile, setProfile } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const called = useRef(false)

  const isBoosterIntent = searchParams.get('booster') === '1'

  useEffect(() => {
    if (called.current) return
    called.current = true

    async function upgrade() {
      if (!profile) return

      // Already a booster — go straight to onboarding or panel
      if (profile.role === 'booster') {
        navigate('/booster', { replace: true })
        return
      }

      // Non-customer roles shouldn't be here
      if (profile.role !== 'customer') {
        navigate('/', { replace: true })
        return
      }

      if (!isBoosterIntent) {
        // Someone visited /apply without the booster=1 flag — send home
        navigate('/', { replace: true })
        return
      }

      // Change role to booster (pending)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await supabase.rpc('request_booster_role') as any
      if (rpcError || !data?.success) {
        setError('Não foi possível iniciar a candidatura. Tente novamente.')
        return
      }

      // Update local store immediately
      setProfile({ ...profile, role: 'booster' })
      navigate('/booster/onboarding', { replace: true })
    }

    upgrade()
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="max-w-sm w-full card p-6 text-center space-y-4">
          <p className="text-danger font-semibold">{error}</p>
          <Link to="/" className="text-sm text-brand hover:underline">Voltar ao início</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base gap-6">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-brand">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold text-ink">Elo<span className="text-brand">Peak</span></span>
        <div className="ml-4"><ThemeToggle /></div>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <p className="text-sm text-ink-secondary">Configurando sua conta de booster…</p>
      </div>
    </div>
  )
}
