import type { ReactNode } from 'react'

const AMBIENT_IMAGE_URL = '/images/site-ambient.png'

// Camadas do clima ambiente, de trás pra frente:
//   1. imagem (fixed, cobre sempre o viewport inteiro -- sem o bug de
//      `background-attachment: fixed` no Safari mobile)
//   2. scrim escuro + gradiente (esmaecido nas laterais/embaixo, um leve
//      halo esverdeado no centro, sem apagar os detalhes da arte)
//   3. conteúdo da aplicação
const OVERLAY_LAYERS = [
  // halo esverdeado sutil, centralizado
  'radial-gradient(ellipse 65% 55% at 50% 42%, rgba(34,197,94,0.14) 0%, rgba(34,197,94,0) 65%)',
  // laterais mais escuras
  'linear-gradient(to right, rgba(6,10,8,0.55) 0%, rgba(6,10,8,0) 20%, rgba(6,10,8,0) 80%, rgba(6,10,8,0.55) 100%)',
  // parte inferior mais escura (rodapé, leitura de texto)
  'linear-gradient(to bottom, rgba(6,10,8,0.05) 0%, rgba(6,10,8,0.35) 55%, rgba(6,10,8,0.78) 100%)',
  // scrim base -- garante contraste mínimo em qualquer trecho da imagem
  'linear-gradient(rgba(8,10,9,0.42), rgba(8,10,9,0.42))',
].join(', ')

interface AmbientBackgroundProps {
  children: ReactNode
}

export function AmbientBackground({ children }: AmbientBackgroundProps) {
  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 pointer-events-none bg-cover bg-no-repeat bg-[65%_center] md:bg-center"
        style={{ backgroundImage: `url(${AMBIENT_IMAGE_URL})` }}
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ backgroundImage: OVERLAY_LAYERS }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
