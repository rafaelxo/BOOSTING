import { Shield, Lock, Eye, Cpu, Server, CreditCard } from 'lucide-react'

const PILLARS = [
  {
    icon: Shield,
    title: 'Account Protection',
    items: [
      'VPN enabled on every gaming session',
      '"Appear Offline" mode — your friends list stays clean',
      'No storing of your login credentials beyond the session',
      'Boosters operate from devices with clean IP history',
    ],
  },
  {
    icon: Lock,
    title: 'Authentication & Sessions',
    items: [
      'Supabase Auth with bcrypt password hashing',
      'Secure JWT sessions with auto-rotation',
      'Session revocation on password change',
      '2FA available for your account',
    ],
  },
  {
    icon: CreditCard,
    title: 'Payment Security',
    items: [
      'Card data never touches our servers — Stripe handles it all',
      'PCI-DSS compliant payment processing',
      'Webhook signature validation on every event',
      'Idempotent payment operations prevent double-charging',
    ],
  },
  {
    icon: Eye,
    title: 'Privacy & Data',
    items: [
      'Minimal data collection — only what\'s needed',
      'Booster never sees your full email or personal details',
      'All stored files use private URLs with expiry',
      'Data deletion available on account close',
    ],
  },
  {
    icon: Cpu,
    title: 'Access Control',
    items: [
      'Row-Level Security — customers only see their own orders',
      'Boosters can only access jobs assigned to them',
      'Admin access is fully audited and logged',
      'Roles are enforced server-side, never trusting the client',
    ],
  },
  {
    icon: Server,
    title: 'Infrastructure',
    items: [
      'All data encrypted at rest and in transit (TLS 1.3)',
      'Hosted on Supabase (SOC 2 Type II certified)',
      'Regular automated backups',
      'Audit log for every sensitive action',
    ],
  },
]

export function SecurityPage() {
  return (
    <div className="py-16">
      <div className="container-app max-w-5xl space-y-16">
        <div className="text-center">
          <p className="section-label mb-3">Transparency</p>
          <h1 className="text-4xl font-extrabold text-ink mb-4">Security & Trust</h1>
          <p className="text-lg text-ink-secondary max-w-xl mx-auto">
            We treat your account and data with the same care we'd want for our own.
            Here's exactly what we do to keep you safe.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PILLARS.map(({ icon: Icon, title, items }) => (
            <div key={title} className="card p-6 space-y-4">
              <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-success" />
              </div>
              <h3 className="font-semibold text-ink">{title}</h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item} className="text-xs text-ink-secondary flex items-start gap-2">
                    <span className="text-success mt-px">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
