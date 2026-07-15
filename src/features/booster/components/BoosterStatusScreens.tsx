import { Link } from 'react-router-dom'
import { Clock, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'

export function PendingScreen() {
  return (
    <div className="max-w-sm text-center space-y-5">
      <div className="h-16 w-16 rounded-full bg-warning/10 border border-warning/25 flex items-center justify-center mx-auto">
        <Clock className="h-8 w-8 text-warning" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-ink mb-2">Candidatura em análise</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Seu formulário foi enviado e está aguardando a validação dos administradores.
          O acesso à plataforma será liberado após a aprovação da sua candidatura.
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

export function RejectedScreen() {
  return (
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

export function NoApplicationScreen() {
  return (
    <div className="max-w-sm text-center space-y-5">
      <div className="h-16 w-16 rounded-full bg-danger/10 border border-danger/25 flex items-center justify-center mx-auto">
        <X className="h-8 w-8 text-danger" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-ink mb-2">Candidatura não encontrada</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Não encontramos uma candidatura de booster vinculada à sua conta.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/apply?booster=1">Preencher formulário</Link>
      </Button>
    </div>
  )
}

export function BoosterStatusErrorScreen() {
  return (
    <div className="max-w-sm text-center space-y-5">
      <div className="h-16 w-16 rounded-full bg-danger/10 border border-danger/25 flex items-center justify-center mx-auto">
        <AlertTriangle className="h-8 w-8 text-danger" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-ink mb-2">Não foi possível confirmar seu status</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Ocorreu um erro ao verificar sua candidatura de booster. Tente novamente em instantes.
        </p>
      </div>
      <Button size="sm" onClick={() => window.location.reload()}>Tentar novamente</Button>
    </div>
  )
}
