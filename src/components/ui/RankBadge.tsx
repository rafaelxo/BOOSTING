import { useState } from 'react'
import { Shield, Star, Gem, Diamond, Crown, Flame, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Division, RankTier } from '@/types'
import { RANK_TIER_LABEL, RANK_TIER_COLOR } from '@/lib/utils'

const MASTER_PLUS: RankTier[] = ['master', 'grandmaster', 'challenger']

// Fallback lucide icons when image not available
const RANK_ICON_FALLBACK: Record<RankTier, React.ElementType> = {
  iron:        Shield,
  bronze:      Shield,
  silver:      Star,
  gold:        Star,
  platinum:    Gem,
  emerald:     Gem,
  diamond:     Diamond,
  master:      Crown,
  grandmaster: Flame,
  challenger:  Trophy,
}

// Image paths from public/ranks/ — user drops the PNGs there
const RANK_IMAGE: Record<RankTier, string> = {
  iron:        '/ranks/iron.png',
  bronze:      '/ranks/bronze.png',
  silver:      '/ranks/silver.png',
  gold:        '/ranks/gold.png',
  platinum:    '/ranks/platinum.png',
  emerald:     '/ranks/emerald.png',
  diamond:     '/ranks/diamond.png',
  master:      '/ranks/master.png',
  grandmaster: '/ranks/grandmaster.png',
  challenger:  '/ranks/challenger.png',
}

type BadgeSize = 'xs' | 'sm' | 'md' | 'lg'

interface RankBadgeProps {
  tier: RankTier
  division?: Division | null
  size?: BadgeSize
  className?: string
  showDivision?: boolean
}

const SIZE_MAP: Record<BadgeSize, { wrap: string; img: string; icon: string; label: string; gap: string }> = {
  xs: { wrap: 'w-9 h-11 rounded-lg p-1',     img: 'h-5 w-5',  icon: 'h-4 w-4', label: 'text-[8px]',  gap: 'gap-0.5' },
  sm: { wrap: 'w-12 h-14 rounded-xl p-1.5',  img: 'h-7 w-7',  icon: 'h-5 w-5', label: 'text-[9px]',  gap: 'gap-0.5' },
  md: { wrap: 'w-16 h-18 rounded-xl p-2',    img: 'h-9 w-9',  icon: 'h-6 w-6', label: 'text-[10px]', gap: 'gap-1'   },
  lg: { wrap: 'w-20 h-24 rounded-2xl p-2.5', img: 'h-12 w-12',icon: 'h-7 w-7', label: 'text-xs',     gap: 'gap-1.5' },
}

function RankIcon({ tier, imgClass, iconClass }: { tier: RankTier; imgClass: string; iconClass: string }) {
  const [imgError, setImgError] = useState(false)
  const FallbackIcon = RANK_ICON_FALLBACK[tier]
  const color        = RANK_TIER_COLOR[tier]

  if (!imgError) {
    return (
      <img
        src={RANK_IMAGE[tier]}
        alt={RANK_TIER_LABEL[tier]}
        className={cn(imgClass, 'object-contain')}
        onError={() => setImgError(true)}
        draggable={false}
      />
    )
  }

  return <FallbackIcon className={cn(iconClass, color)} />
}

export function RankBadge({
  tier, division, size = 'md', className, showDivision = true,
}: RankBadgeProps) {
  const sc          = SIZE_MAP[size]
  const color       = RANK_TIER_COLOR[tier]
  const isMasterPlus = MASTER_PLUS.includes(tier)
  const divLabel    = showDivision && !isMasterPlus && division ? ` ${division}` : ''

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center bg-bg-elevated border border-bg-overlay shrink-0',
        sc.wrap, sc.gap, className,
      )}
    >
      <RankIcon tier={tier} imgClass={sc.img} iconClass={sc.icon} />
      <span className={cn('font-bold text-center leading-tight', sc.label, color)}>
        {RANK_TIER_LABEL[tier]}{divLabel}
      </span>
    </div>
  )
}
