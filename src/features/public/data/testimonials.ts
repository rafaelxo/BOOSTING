export interface Testimonial {
  name: string
  service: 'boost' | 'coaching'
  /** Boost: transição de rank ("Ouro → Platina"). Coaching: foco da sessão ("Coaching de Jungle"). */
  tag: string
  rating: number
  comment: string
  /** Id de ícone de perfil do LoL (Data Dragon) exibido no avatar do card. */
  iconId: number
}

export const TESTIMONIALS: Testimonial[] = [
  { name: 'Bruno S.',       service: 'boost',    tag: 'Ouro → Platina',      rating: 5, iconId: 8,  comment: 'Experiência muito tranquila. Paguei no PIX e acompanhei as partidas ao vivo — cheguei na Platina em 2 dias.' },
  { name: 'kaduzera',       service: 'boost',    tag: 'Prata → Diamante',    rating: 5, iconId: 12, comment: 'Do Prata ao Diamante em uma semana. Depois ainda peguei umas sessões de coaching e mudou completamente meu jogo de mid.' },
  { name: 'Larissa F.',     service: 'boost',    tag: 'Ferro → Ouro',        rating: 5, iconId: 15, comment: 'Tava com receio no começo, mas foi tudo seguro e o suporte respondeu rápido em qualquer dúvida.' },
  { name: 'raphaADC',       service: 'boost',    tag: 'Bronze → Platina',    rating: 5, iconId: 4,  comment: 'Usei a transmissão ao vivo pra acompanhar. O booster jogava de ADC do jeito que eu pedi, dava pra aprender só assistindo.' },
  { name: 'Camila R.',      service: 'boost',    tag: 'Platina → Diamante',  rating: 5, iconId: 9,  comment: 'Segunda vez usando o serviço. O atendimento continua rápido e o booster foi super educado.' },
  { name: 'Thiago A.',      service: 'coaching', tag: 'Coaching de Jungle',  rating: 5, iconId: 22, comment: 'Fiz 3 sessões focadas em jungle. O coach revisou minhas replays e hoje eu leio o mapa muito melhor.' },
  { name: 'biel.top',       service: 'boost',    tag: 'Ouro → Esmeralda',    rating: 4, iconId: 28, comment: 'Demorou um pouco mais que o previsto, mas o booster manteve contato o tempo todo. Fiquei satisfeito.' },
  { name: 'gih.support',    service: 'coaching', tag: 'Coaching de Suporte', rating: 5, iconId: 25, comment: 'Achei que já sabia jogar de suporte, mas o coach me mostrou erros de posicionamento que eu nem enxergava. Valeu cada centavo.' },
  { name: 'nandinha_mid',   service: 'boost',    tag: 'Prata → Ouro',        rating: 5, iconId: 18, comment: 'Pedi de madrugada e de manhã já tinha começado. Não esperava essa velocidade.' },
  { name: 'Matheus B.',     service: 'coaching', tag: 'Coaching de Mid',     rating: 5, iconId: 29, comment: 'O coach analisou meu VOD e me passou um plano de treino. Em duas semanas já senti diferença no farm e nas trocas.' },
  { name: 'VoidWalker_BR',  service: 'boost',    tag: 'Diamante → Mestre',   rating: 5, iconId: 44, comment: 'Serviço de high elo é sério mesmo. Booster nível Desafiante, taxa de vitória absurda e execução impecável.' },
  { name: 'julinha.gg',     service: 'coaching', tag: 'Coaching de ADC',     rating: 5, iconId: 7,  comment: 'Sessão ao vivo — o coach jogava junto e ia corrigindo na hora. Muito mais rápido que assistir vídeo sozinha.' },
  { name: 'davizera_',      service: 'boost',    tag: 'Bronze → Ouro',       rating: 5, iconId: 1,  comment: 'Além de subir a conta, aprendi bastante só de ver as partidas pela transmissão.' },
  { name: 'renatinho10',    service: 'coaching', tag: 'Coaching de Top',     rating: 5, iconId: 23, comment: 'Sempre travava contra tank. O coach me ensinou timing de wave e trocas — subi de elo sozinho depois.' },
]
