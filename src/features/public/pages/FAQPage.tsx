import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const FAQS = [
  {
    q: 'Is elo boosting safe?',
    a: "We use VPN on all sessions, appear-offline mode, and never store your credentials beyond the active order. Our boosters have clean IP histories and follow strict account-safety protocols. We've completed 48,000+ orders without a single permanent ban from our methods.",
  },
  {
    q: 'How long will my order take?',
    a: 'Most orders begin within 30 minutes of payment confirmation. Estimated delivery times are shown before checkout and depend on rank gap, queue type, and server. Priority add-on guarantees a top-rated booster is assigned immediately.',
  },
  {
    q: 'Can I watch my booster play?',
    a: 'Yes — add the "Live Stream" extra during checkout and you\'ll receive a private stream link after your order starts. You can watch every game in real time.',
  },
  {
    q: 'What if the order isn\'t completed?',
    a: 'We offer a 100% completion guarantee. If a booster cannot finish your order for any reason, we reassign it or issue a full refund. No questions asked.',
  },
  {
    q: 'Do I share my account password?',
    a: 'For solo boosting, yes — you share login credentials through our encrypted platform, and they are cleared from our systems as soon as the order finishes. For duo boosting, you play alongside our booster and no credentials are needed.',
  },
  {
    q: 'Can I request a specific champion or role?',
    a: 'Yes. During the order configuration step you can specify role and champion preferences. Add the "Mono Champion" extra for guaranteed one-champion play.',
  },
  {
    q: 'What servers do you support?',
    a: 'We support all major League of Legends servers: NA, EUW, EUNE, BR, LAN, LAS, OCE, TR, RU, JP, and KR.',
  },
  {
    q: 'How are boosters vetted?',
    a: 'All boosters apply through our platform and go through a multi-step verification: rank proof, identity check, test games review, and a waiting period under observation. Only Diamond IV+ boosters are approved, with Grandmaster/Challenger required for high-elo orders.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards (Visa, Mastercard, Amex), Apple Pay, and Google Pay, processed securely through Stripe.',
  },
  {
    q: 'Can I chat with my booster?',
    a: 'Absolutely. Every order includes an in-order chat where you can message your booster directly. We also offer customer support tickets for billing or platform issues.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-bg-elevated last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm font-semibold text-ink">{q}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-ink-muted shrink-0 mt-0.5 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm text-ink-secondary leading-relaxed -mt-1">{a}</p>
      )}
    </div>
  )
}

export function FAQPage() {
  return (
    <div className="py-16">
      <div className="container-app max-w-3xl">
        <div className="text-center mb-12">
          <p className="section-label mb-3">Questions</p>
          <h1 className="text-4xl font-extrabold text-ink mb-4">Frequently Asked Questions</h1>
          <p className="text-ink-secondary">
            Can't find what you're looking for?{' '}
            <a href="/support" className="text-brand hover:underline">Contact support</a>.
          </p>
        </div>

        <div className="card p-0 divide-y-0">
          <div className="px-6">
            {FAQS.map(({ q, a }) => (
              <FAQItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
