// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'booster' | 'admin'

export type BoostMode = 'solo' | 'duo'

export type GameSlug = 'lol' | 'valorant' | 'tft'

export type ServiceType =
  | 'elo_boost'
  | 'win_boost'
  | 'coaching'
  | 'placement_matches'
  | 'md5'

export type QueueType = 'solo_duo' | 'flex'

export type OrderStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'paid'
  | 'awaiting_assignment'
  | 'assigned'
  | 'in_progress'
  | 'paused'
  | 'drop_requested'
  | 'awaiting_customer'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'canceled'

export type BoosterStatus = 'pending' | 'under_review' | 'approved' | 'suspended' | 'rejected'

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed'

export type NotificationType =
  | 'order_status_changed'
  | 'order_assigned'
  | 'order_completed'
  | 'message_received'
  | 'ticket_updated'
  | 'payment_confirmed'
  | 'review_received'
  | 'booster_approved'

// ─── Rank / Tier system ───────────────────────────────────────────────────────

export type RankTier =
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'emerald'
  | 'diamond'
  | 'master'
  | 'grandmaster'
  | 'challenger'

export type Division = 'I' | 'II' | 'III' | 'IV'

export interface Rank {
  tier: RankTier
  division: Division | null  // null for Master+
  lp?: number
}

// ─── User / Profile ───────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  role: UserRole
  username: string
  avatar_url: string | null
  discord_id: string | null
  terms_accepted_at: string | null
  privacy_accepted_at: string | null
  legal_version: string | null
  created_at: string
  updated_at: string
}

export interface BoosterProfile {
  id: string
  user_id: string
  display_name: string
  display_name_changed_at: string | null
  avatar_url: string | null
  status: BoosterStatus
  bio: string | null
  peak_rank: Rank | null
  current_rank: Rank | null
  total_completed: number
  total_earnings: number
  rating: number
  rating_count: number
  games: string[]
  is_available: boolean
  is_top5: boolean
  opgg_link: string | null
  hours_per_day_min: number | null
  hours_per_day_max: number | null
  full_name: string | null
  email: string | null
  cpf: string | null
  lanes: string[] | null
  specialties: string[] | null
  can_coach: boolean | null
  available_days: string[] | null
  verified_at: string | null
  rank_stats: {
    gold_minus?:    { kda: number; winrate: number }
    plat_diamond?:  { kda: number; winrate: number }
    master_plus?:   { kda: number; winrate: number }
  } | null
  last_active_at: string | null
  created_at: string
  updated_at: string
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface Service {
  id: string
  game_id: string
  type: ServiceType
  name: string
  description: string | null
  short_description: string | null
  is_active: boolean
  sort_order: number
}

// Fluxo do configurador de boost ao qual um addon pertence. null = extra
// legado (pré-reforma), mantido só para exibição de pedidos antigos —
// nunca oferecido no configurador atual.
export type BoostFlow = 'solo_standard' | 'duo_standard' | 'master_plus'

export interface ServiceExtra {
  id: string
  service_id: string | null  // null = applies to all
  name: string
  description: string
  price_modifier: number       // flat BRL
  price_modifier_pct: number   // % of base price
  is_active: boolean
  sort_order: number
  icon: string | null
  flow: BoostFlow | null
  code: string | null          // identificador estável — nunca o label
}

export interface MasterPlusPricing {
  id: string
  tier: 'master' | 'grandmaster' | 'challenger'
  price: number | null   // null = tier ainda sem preço comercial definido
  updated_at: string
  updated_by: string | null
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface OrderExtra {
  extra_id: string
  name: string
  price: number
  // Campos novos (pedidos criados após a reforma do configurador) — podem
  // ser undefined em pedidos antigos, que só tinham extra_id/name/price.
  code?: string
  percentage?: number
  // Posição de exibição travada no momento da criação do pedido — não
  // depende de reconsultar service_extras (que pode mudar depois). Acesso
  // Prioritário é sempre o maior valor aqui.
  sort_order?: number
}

export interface Order {
  id: string
  customer_id: string
  service_id: string
  // Denormalized at creation time from services.type — service_id is a
  // uuid (services.id), never compare it directly against a ServiceType slug.
  service_type: ServiceType
  game_id: string
  status: OrderStatus
  queue_type: QueueType
  boost_mode: BoostMode
  server: string
  current_rank: Rank
  target_rank: Rank | null
  wins_purchased: number | null       // for win boost
  sessions_purchased: number | null   // for coaching
  extras: OrderExtra[]
  base_price: number
  extras_price: number
  total_price: number
  estimated_hours: number | null
  customer_notes: string | null
  booster_notes: string | null
  wins_played: number
  losses_played: number
  assigned_booster_id: string | null
  chat_locked: boolean
  chat_locked_by: string | null
  chat_locked_at: string | null
  mp_payment_id: string | null
  payment_status: PaymentStatus | null
  credentials_set: boolean
  credential_expires_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  // Boost Master+ — null para pedidos que não são Master+ (Solo/Duo padrão
  // não têm PDL atual/médias; ver shared/boostDomain.ts).
  current_pdl: number | null
  pdl_bracket: '0_49' | '50_89' | '90_119' | '120_plus' | null
  avg_pdl_gain: number | null
  avg_pdl_loss: number | null
  pricing_version: string
  // Pedido direto: booster escolhido no perfil público antes do pagamento.
  // exclusive_until é setado só quando o pagamento é confirmado — enquanto
  // estiver no futuro, o pedido só aparece para esse booster no pool.
  preferred_booster_id: string | null
  exclusive_until: string | null
  // Riot ID (nome#tag) usado pra verificar automaticamente se o rank alvo
  // foi atingido — só coletado em fluxos que têm target_rank (elo_boost).
  riot_id: string | null
  // Pacote de coach comprado (booster_services.id) — só setado quando
  // service_type === 'coaching'.
  booster_service_id: string | null
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  changed_by: string
  reason: string | null
  created_at: string
}

export interface OrderRankVerification {
  id: string
  order_id: string
  requested_by: string
  riot_id_checked: string
  fetched_tier: RankTier | null
  fetched_division: Division | null
  target_tier: RankTier
  target_division: Division | null
  passed: boolean
  error_reason: string | null
  created_at: string
}

export interface OrderDropRequest {
  id: string
  order_id: string
  booster_id: string
  reason: string
  wins_at_request: number
  losses_at_request: number
  penalty_pct: number
  penalty_amount: number
  status: 'pending' | 'approved' | 'rejected'
  admin_id: string | null
  admin_note: string | null
  created_at: string
  resolved_at: string | null
}

export interface OrderChatMessage {
  id: string
  order_id: string
  sender_id: string
  sender_role: UserRole
  sender_name: string
  sender_avatar_url: string | null
  content: string
  created_at: string
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string
  order_id: string
  customer_id: string
  mp_payment_id: string
  amount: number
  currency: string
  status: PaymentStatus
  payment_method_type: string | null
  webhook_event_id: string | null
  refunded_amount: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Refund {
  id: string
  payment_id: string
  order_id: string
  mp_refund_id: string
  amount: number
  reason: string
  initiated_by: string
  status: 'pending' | 'succeeded' | 'failed'
  created_at: string
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface Review {
  id: string
  order_id: string
  customer_id: string
  booster_id: string | null
  rating: number  // 1-5
  content: string | null
  is_public: boolean
  is_moderated: boolean
  admin_note: string | null
  created_at: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  data: Record<string, unknown>
  is_read: boolean
  created_at: string
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  actor_id: string
  actor_role: UserRole
  action: string
  entity_type: string
  entity_id: string
  diff: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface PayoutRecord {
  id: string
  booster_id: string
  order_id: string
  gross_amount: number
  commission_rate: number
  commission_amount: number
  net_amount: number
  status: 'pending' | 'processing' | 'paid' | 'failed'
  paid_at: string | null
  created_at: string
}

// ─── Duo accounts ───────────────────────────────────────────────────────────────

export interface DuoAccount {
  id: string
  game_id: string
  label: string
  current_rank: { tier: RankTier; division: Division } | null
  notes: string | null
  encrypted_credentials: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ─── Booster Services ─────────────────────────────────────────────────────────

export interface BoosterService {
  id: string
  booster_id: string
  title: string
  description: string | null
  tempo: string | null
  price: number
  service_type: string | null
  unit: string
  requirements: string | null
  availability_note: string | null
  is_active: boolean
  rules: string | null
  // Pacotes de coach: até 2 lanes e especialidades de um vocabulário fixo
  // (src/lib/lolTaxonomy.ts) — null pra registros antigos não-coaching.
  lanes: string[] | null
  specialties: string[] | null
  created_at: string
  updated_at: string
}
