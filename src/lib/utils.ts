import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { OrderStatus, RankTier, TicketStatus, TicketPriority, BoosterStatus, OrderExtra } from '@/types'

export { RANK_TIER_ORDER } from '../../shared/pricing'

// Tailwind class merging
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date formatting
export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy', { locale: ptBR })
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy · HH:mm', { locale: ptBR })
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

// ─── Order status display ─────────────────────────────────────────────────────

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Rascunho',
  awaiting_payment: 'Aguardando Pagamento',
  paid: 'Pagamento Confirmado',
  awaiting_assignment: 'Esperando Booster',
  assigned: 'Booster Atribuído',
  in_progress: 'Em Andamento',
  paused: 'Pausado',
  drop_requested: 'Solicitação de Drop',
  awaiting_customer: 'Aguardando Cliente',
  completed: 'Concluído',
  disputed: 'Disputado',
  refunded: 'Reembolsado',
  canceled: 'Cancelado',
}

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'text-ink-secondary bg-bg-overlay',
  awaiting_payment: 'text-warning bg-warning/10',
  paid: 'text-info bg-info/10',
  awaiting_assignment: 'text-info bg-info/10',
  assigned: 'text-brand bg-brand/10',
  in_progress: 'text-success bg-success/10',
  paused: 'text-warning bg-warning/10',
  drop_requested: 'text-danger bg-danger/10',
  awaiting_customer: 'text-accent bg-accent/10',
  completed: 'text-success bg-success/10',
  disputed: 'text-danger bg-danger/10',
  refunded: 'text-ink-secondary bg-bg-overlay',
  canceled: 'text-ink-muted bg-bg-overlay',
}

// ─── Rank display ─────────────────────────────────────────────────────────────

export const RANK_TIER_COLOR: Record<RankTier, string> = {
  iron: 'text-rank-iron',
  bronze: 'text-rank-bronze',
  silver: 'text-rank-silver',
  gold: 'text-rank-gold',
  platinum: 'text-rank-platinum',
  emerald: 'text-rank-emerald',
  diamond: 'text-rank-diamond',
  master: 'text-rank-master',
  grandmaster: 'text-rank-grandmaster',
  challenger: 'text-rank-challenger',
}

export const RANK_TIER_LABEL: Record<RankTier, string> = {
  iron: 'Ferro',
  bronze: 'Bronze',
  silver: 'Prata',
  gold: 'Ouro',
  platinum: 'Platina',
  emerald: 'Esmeralda',
  diamond: 'Diamante',
  master: 'Mestre',
  grandmaster: 'Grão-mestre',
  challenger: 'Desafiante',
}

export function formatRank(tier: RankTier, division?: string | null) {
  const tierLabel = RANK_TIER_LABEL[tier]
  if (!division || ['master', 'grandmaster', 'challenger'].includes(tier)) return tierLabel
  return `${tierLabel} ${division}`
}

// Ordena o snapshot de extras gravado no pedido pela posição travada na
// criação (sort_order) — nunca pela ordem em que veio do banco/array.
// Pedidos antigos (sem sort_order) caem no fim, na ordem em que já
// estavam, sem quebrar a exibição.
export function sortOrderExtras(extras: OrderExtra[]): OrderExtra[] {
  return [...extras].sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER))
}

// ─── Booster status ───────────────────────────────────────────────────────────

export const BOOSTER_STATUS_LABEL: Record<BoosterStatus, string> = {
  pending: 'Pendente',
  under_review: 'Em Revisão',
  approved: 'Aprovado',
  suspended: 'Suspenso',
  rejected: 'Rejeitado',
}

export const BOOSTER_STATUS_COLOR: Record<BoosterStatus, string> = {
  pending: 'text-warning bg-warning/10',
  under_review: 'text-info bg-info/10',
  approved: 'text-success bg-success/10',
  suspended: 'text-danger bg-danger/10',
  rejected: 'text-ink-muted bg-bg-overlay',
}

// ─── Ticket status ────────────────────────────────────────────────────────────

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em Andamento',
  waiting_customer: 'Aguardando Cliente',
  resolved: 'Resolvido',
  closed: 'Fechado',
}

export const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  open: 'text-danger bg-danger/10',
  in_progress: 'text-brand bg-brand/10',
  waiting_customer: 'text-accent bg-accent/10',
  resolved: 'text-success bg-success/10',
  closed: 'text-ink-muted bg-bg-overlay',
}

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

export const TICKET_PRIORITY_COLOR: Record<TicketPriority, string> = {
  low: 'text-ink-secondary',
  medium: 'text-warning',
  high: 'text-danger',
  urgent: 'text-danger font-bold',
}

// ─── Service label ────────────────────────────────────────────────────────────

const SERVICE_LABEL_MAP: Record<string, string> = {
  elo_boost:         'Solo Boost / Duo Boost',
  win_boost:         'Vitórias / MD5',
  placement_matches: 'MD5 Completo (legado)',
  coaching:          'Coaching',
  md5:               'Vitórias / MD5',
}

export function getServiceLabel(serviceId: string): string {
  return SERVICE_LABEL_MAP[serviceId] ?? serviceId.replace(/_/g, ' ')
}

// Share of order.total_price the booster receives before an authoritative
// payout_records row exists (mirrors the platform commission split).
export const BOOSTER_EARNINGS_SHARE = 0.75

// ─── Misc ─────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Usado para distinguir um uuid real de catálogo (games.id/services.id) de um
// slug/tipo cru (ex.: 'lol', 'win_boost') que ainda não foi resolvido — ver
// OrderBuilder.tsx/StepPayment.tsx.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}
