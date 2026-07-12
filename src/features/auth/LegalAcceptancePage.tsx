import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { CheckCircle2, ShieldCheck, Zap } from 'lucide-react'
import { Button, ThemeToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { LEGAL_VERSION } from '@/lib/legal'
import { useAuthStore } from '@/stores/authStore'

export function LegalAcceptancePage() {
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { profile, setProfile } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const canContinue = termsAccepted && privacyAccepted

  function targetPath() {
    const raw = searchParams.get('redirect')
    if (raw) {
      try {
        const decoded = decodeURIComponent(raw)
        if (/^\/(?![/\\])/.test(decoded) && decoded !== '/legal/acceptance') return decoded
      } catch { /* ignore malformed redirect */ }
    }
    if (profile?.role === 'admin' || profile?.role === 'support') return '/admin'
    if (profile?.role === 'booster') return '/booster'
    return '/dashboard'
  }

  async function acceptLegal() {
    if (!profile || !canContinue) return
    setSaving(true)
    setError(null)

    const acceptedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        terms_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        legal_version: LEGAL_VERSION,
      })
      .eq('id', profile.id)

    if (updateError) {
      setError('Não foi possível registrar o aceite. Tente novamente.')
      setSaving(false)
      return
    }

    setProfile({
      ...profile,
      terms_accepted_at: acceptedAt,
      privacy_accepted_at: acceptedAt,
      legal_version: LEGAL_VERSION,
    })
    navigate(targetPath(), { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-brand">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-ink">
              Elo<span className="text-brand">Peak</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="card p-6 space-y-5">
          <div className="space-y-2">
            <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-brand" />
            </div>
            <h1 className="text-xl font-bold text-ink">Antes de continuar</h1>
            <p className="text-sm text-ink-secondary">
              Para criar sua conta na EloPeak, confirme que você leu e concorda com os documentos abaixo.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-bg-elevated bg-bg-card p-3 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                Li e concordo com os{' '}
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  Termos de Uso
                </Link>.
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-bg-elevated bg-bg-card p-3 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                Li e concordo com a{' '}
                <Link
                  to="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  Política de Privacidade
                </Link>.
              </span>
            </label>
          </div>

          {error && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>}

          <Button
            className="w-full"
            disabled={!canContinue}
            loading={saving}
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
            onClick={acceptLegal}
          >
            Aceitar e continuar
          </Button>
        </div>
      </div>
    </div>
  )
}
