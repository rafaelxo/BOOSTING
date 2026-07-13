import { ExternalLink } from 'lucide-react'

const TICKET_URL = import.meta.env.VITE_DISCORD_TICKET_URL as string | undefined

/**
 * Aviso de que a troca da conta Discord vinculada não pode ser feita pelo
 * usuário — precisa ser solicitada a um administrador. O botão só aparece
 * quando VITE_DISCORD_TICKET_URL está configurada; sem a env var, mostra
 * apenas o texto (nunca um link vazio/inválido).
 */
export function DiscordAccountNotice() {
  return (
    <div className="rounded-xl border border-bg-elevated bg-bg-elevated/30 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Conta Discord</p>
      <p className="text-[11px] text-ink-secondary leading-relaxed">
        Precisa trocar a conta do Discord vinculada? Por segurança, essa alteração deve ser
        solicitada a um administrador por meio de um ticket no servidor oficial.
      </p>
      {TICKET_URL && (
        <a
          href={TICKET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-brand font-semibold hover:underline"
        >
          Abrir ticket no Discord <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
