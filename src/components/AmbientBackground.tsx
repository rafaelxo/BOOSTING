import type { ReactNode } from 'react'

// Camadas do clima ambiente, de trás pra frente:
//   1. imagem (fixed, cobre sempre o viewport inteiro -- sem o bug de
//      `background-attachment: fixed` no Safari mobile), troca com o tema
//      via --ambient-url (ver globals.css)
//   2. scrim + gradiente (esmaecido nas laterais/embaixo, um leve halo
//      esverdeado no centro), também troca com o tema via --ambient-overlay
//      -- claro no tema light (texto escuro), escuro no tema dark (texto
//      claro), sempre mantendo contraste com --color-ink
//   3. conteúdo da aplicação
interface AmbientBackgroundProps {
  children: ReactNode
}

export function AmbientBackground({ children }: AmbientBackgroundProps) {
  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 pointer-events-none bg-no-repeat bg-[65%_center] md:bg-center"
        style={{
          backgroundImage: 'var(--ambient-url)',
          backgroundSize: 'var(--ambient-size, cover)',
          backgroundColor: 'rgb(var(--color-bg-base))',
        }}
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ backgroundImage: 'var(--ambient-overlay)' }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
