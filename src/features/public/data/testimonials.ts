export interface Testimonial {
  name: string
  rank: string
  rating: number
  comment: string
}

export const TESTIMONIALS: Testimonial[] = [
  { name: 'Alex M.', rank: 'Ouro → Platina', rating: 5, comment: 'Experiência muito tranquila. Cheguei à Platina em 2 dias e recebi atualizações durante todo o pedido.' },
  { name: 'TurboKai', rank: 'Prata → Diamante', rating: 5, comment: 'Fui do Prata ao Diamante em uma semana. Também usei coaching e mudou completamente minha forma de jogar.' },
  { name: 'Sarah V.', rank: 'Ferro → Ouro', rating: 5, comment: 'Eu estava com receio no começo, mas o serviço foi seguro, rápido e com ótima comunicação.' },
  { name: 'NightFury99', rank: 'Bronze → Platina', rating: 5, comment: 'Usei a transmissão ao vivo e acompanhei todas as partidas. O booster jogou muito bem.' },
  { name: 'CosmicPlayer', rank: 'Platina → Diamante', rating: 5, comment: 'Segunda vez usando o serviço. O atendimento continua rápido e o booster foi muito responsivo.' },
  { name: 'JaxMain', rank: 'Ouro → Esmeralda', rating: 4, comment: 'Demorou um pouco mais do que o previsto, mas o booster manteve boa comunicação. Fiquei satisfeito.' },
  { name: 'CryptoADC', rank: 'Prata → Ouro', rating: 5, comment: 'Pedi tarde da noite e de manhã o booster já tinha começado. A velocidade surpreendeu.' },
  { name: 'VoidWalker_', rank: 'Diamante → Mestre', rating: 5, comment: 'O serviço high elo é sério. Booster nível Desafiante, ótima taxa de vitória e execução impecável.' },
  { name: 'MidOrFeed22', rank: 'Bronze → Ouro', rating: 5, comment: 'Além de subir minha conta, aprendi bastante acompanhando as partidas pela transmissão.' },
]
