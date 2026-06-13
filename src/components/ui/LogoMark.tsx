import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn('shrink-0 rounded-xl bg-center bg-no-repeat', className)}
      style={{
        backgroundImage: 'url(/dark.png)',
        backgroundSize: '145%',
      }}
      role="img"
      aria-label="EloPeak logo"
    />
  )
}
