import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

export function GuaranteeNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-brand shrink-0" />
        <p className="text-sm font-bold text-ink">{title}</p>
      </div>
      <p className="text-xs text-ink-secondary leading-relaxed">{children}</p>
    </div>
  )
}
