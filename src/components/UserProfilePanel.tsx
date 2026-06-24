import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, LogOut, ExternalLink } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { supabase, signOut } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ── DDragon ───────────────────────────────────────────────────────────────────

async function fetchVersion(): Promise<string> {
  const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  const list: string[] = await res.json()
  return list[0]
}

async function fetchIconIds(version: string): Promise<number[]> {
  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/profileicon.json`,
  )
  const json = await res.json()
  return Object.keys(json.data as Record<string, unknown>)
    .map(Number)
    .sort((a, b) => a - b)
}

function iconUrl(version: string, id: number) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`
}

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  customer: { label: 'Cliente',  className: 'text-brand bg-brand/10'      },
  booster:  { label: 'Booster',  className: 'text-success bg-success/10'  },
  admin:    { label: 'Admin',    className: 'text-danger bg-danger/10'     },
  support:  { label: 'Suporte',  className: 'text-warning bg-warning/10'  },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UserProfilePanelProps {
  open: boolean
  onClose: () => void
}

export function UserProfilePanel({ open, onClose }: UserProfilePanelProps) {
  const { profile, setProfile } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const isBooster = profile?.role === 'booster'

  // ── Username ──
  const [username, setUsername]             = useState(profile?.username ?? '')
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameError, setUsernameError]   = useState<string | null>(null)
  const [usernameSaved, setUsernameSaved]   = useState(false)

  // ── Riot icon ──
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [iconSaving, setIconSaving] = useState(false)

  // ── Booster: display_name ──
  const [displayName, setDisplayName]           = useState('')
  const [displayNameSaving, setDisplayNameSaving] = useState(false)
  const [displayNameError, setDisplayNameError]   = useState<string | null>(null)
  const [displayNameSaved, setDisplayNameSaved]   = useState(false)

  // ── Booster: full_name ──
  const [fullName, setFullName]           = useState('')
  const [fullNameSaving, setFullNameSaving] = useState(false)
  const [fullNameSaved, setFullNameSaved]   = useState(false)

  // ── Booster: CPF ──
  const [cpf, setCpf]             = useState('')
  const [cpfSaving, setCpfSaving] = useState(false)
  const [cpfError, setCpfError]   = useState<string | null>(null)
  const [cpfSaved, setCpfSaved]   = useState(false)

  // Sync username
  useEffect(() => { setUsername(profile?.username ?? '') }, [profile?.username])

  // Parse current icon
  useEffect(() => {
    if (profile?.avatar_url) {
      const m = profile.avatar_url.match(/profileicon\/(\d+)\.png/)
      if (m) setSelectedId(parseInt(m[1]))
    }
  }, [profile?.avatar_url])

  // DDragon
  const { data: version } = useQuery({
    queryKey: ['ddragon-version'],
    queryFn: fetchVersion,
    staleTime: 1000 * 60 * 60,
  })

  const { data: iconIds = [] } = useQuery({
    queryKey: ['ddragon-icons', version],
    queryFn: () => fetchIconIds(version!),
    enabled: !!version && open,
    staleTime: 1000 * 60 * 60,
  })

  // Booster profile data
  const { data: boosterData } = useQuery({
    queryKey: ['booster-profile-panel', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('display_name, full_name, cpf')
        .eq('user_id', profile!.id)
        .single()
      if (error) throw error
      return data as { display_name: string; full_name: string | null; cpf: string | null }
    },
    enabled: !!profile?.id && open && isBooster,
  })

  useEffect(() => {
    if (boosterData) {
      setDisplayName(boosterData.display_name ?? '')
      setFullName(boosterData.full_name ?? '')
      setCpf(boosterData.cpf ? formatCpf(boosterData.cpf) : '')
    }
  }, [boosterData])

  function formatCpf(raw: string) {
    const d = raw.replace(/\D/g, '')
    if (d.length !== 11) return raw
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }

  function handleCpfChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11)
    let fmt = digits
    if (digits.length > 9) fmt = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    else if (digits.length > 6) fmt = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    else if (digits.length > 3) fmt = `${digits.slice(0, 3)}.${digits.slice(3)}`
    setCpf(fmt)
    setCpfError(null)
  }

  // ── Handlers ──

  async function handleSaveUsername() {
    if (!profile || !username.trim()) return
    setUsernameSaving(true)
    setUsernameError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await supabase.rpc('update_my_username', { p_username: username.trim() }) as any
    setUsernameSaving(false)
    if (error || !result?.success) {
      setUsernameError(result?.error === 'username_taken' ? 'Nome já em uso' : 'Erro ao salvar')
      return
    }
    setProfile({ ...profile, username: username.trim() })
    setUsernameSaved(true)
    setTimeout(() => setUsernameSaved(false), 3000)
  }

  async function handleSelectIcon(id: number) {
    if (!profile || !version) return
    setSelectedId(id)
    setIconSaving(true)
    const url = iconUrl(version, id)
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    setProfile({ ...profile, avatar_url: url })
    setIconSaving(false)
  }

  async function handleSaveDisplayName() {
    if (!profile || !displayName.trim()) return
    setDisplayNameSaving(true)
    setDisplayNameError(null)
    const { error } = await supabase
      .from('booster_profiles')
      .update({ display_name: displayName.trim() })
      .eq('user_id', profile.id)
    setDisplayNameSaving(false)
    if (error) { setDisplayNameError('Erro ao salvar'); return }
    setDisplayNameSaved(true)
    qc.invalidateQueries({ queryKey: ['booster-profile-panel', profile.id] })
    setTimeout(() => setDisplayNameSaved(false), 3000)
  }

  async function handleSaveFullName() {
    if (!profile) return
    setFullNameSaving(true)
    await supabase
      .from('booster_profiles')
      .update({ full_name: fullName.trim() || null })
      .eq('user_id', profile.id)
    setFullNameSaving(false)
    setFullNameSaved(true)
    setTimeout(() => setFullNameSaved(false), 3000)
  }

  async function handleSaveCpf() {
    if (!profile) return
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) { setCpfError('CPF inválido'); return }
    setCpfSaving(true)
    setCpfError(null)
    const { error } = await supabase
      .from('booster_profiles')
      .update({ cpf: digits })
      .eq('user_id', profile.id)
    setCpfSaving(false)
    if (error) { setCpfError('Erro ao salvar'); return }
    setCpfSaved(true)
    setTimeout(() => setCpfSaved(false), 3000)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  if (!open) return null

  const roleBadge = ROLE_BADGE[profile?.role ?? 'customer']

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <aside className="fixed right-0 top-0 h-full w-80 bg-bg-surface border-l border-bg-elevated z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-elevated shrink-0">
          <h2 className="text-sm font-bold text-ink">Configurações de Perfil</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-elevated text-ink-muted hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <Avatar src={profile?.avatar_url} name={profile?.username} size="lg" />
            <div className="min-w-0">
              <p className="font-semibold text-ink text-sm truncate">{profile?.username}</p>
              <p className="text-xs text-ink-muted truncate">{profile?.email}</p>
              {roleBadge && (
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block font-semibold', roleBadge.className)}>
                  {roleBadge.label}
                </span>
              )}
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Nome de usuário</p>
            <div className="flex gap-2">
              <input
                value={username}
                onChange={e => { setUsername(e.target.value); setUsernameError(null) }}
                placeholder="username"
                maxLength={24}
                className="input-base flex-1 text-sm"
              />
              <button
                type="button"
                onClick={handleSaveUsername}
                disabled={usernameSaving || !username.trim() || username === profile?.username}
                className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors shrink-0"
              >
                {usernameSaving ? '...' : 'Salvar'}
              </button>
            </div>
            {usernameError && <p className="text-xs text-danger">{usernameError}</p>}
            {usernameSaved && <p className="text-xs text-success">Nome salvo!</p>}
          </div>

          {/* Riot icon picker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Ícone de Perfil</p>
              {iconSaving && <span className="text-[10px] text-ink-muted">Salvando...</span>}
            </div>
            <p className="text-[11px] text-ink-secondary">Ícones oficiais do League of Legends.</p>
            {version && iconIds.length > 0 ? (
              <div className="grid grid-cols-6 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                {iconIds.slice(0, 240).map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectIcon(id)}
                    className={cn(
                      'aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-110 focus:outline-none',
                      selectedId === id ? 'border-brand shadow-sm' : 'border-transparent',
                    )}
                  >
                    <img
                      src={iconUrl(version, id)}
                      alt={`Ícone ${id}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-bg-elevated animate-pulse" />
                ))}
              </div>
            )}
          </div>

          {/* Booster-only fields */}
          {isBooster && (
            <>
              <div className="border-t border-bg-elevated pt-4 space-y-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Conta Booster</p>

                {/* Display name */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Nome de exibição</p>
                  <div className="flex gap-2">
                    <input
                      value={displayName}
                      onChange={e => { setDisplayName(e.target.value); setDisplayNameError(null) }}
                      placeholder="Nome público"
                      maxLength={32}
                      className="input-base flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSaveDisplayName}
                      disabled={displayNameSaving || !displayName.trim() || displayName.trim() === boosterData?.display_name}
                      className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {displayNameSaving ? '...' : 'Salvar'}
                    </button>
                  </div>
                  {displayNameError && <p className="text-xs text-danger">{displayNameError}</p>}
                  {displayNameSaved && <p className="text-xs text-success">Nome salvo!</p>}
                </div>

                {/* Full name */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Nome completo (PIX)</p>
                  <div className="flex gap-2">
                    <input
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Como no CPF"
                      maxLength={120}
                      className="input-base flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSaveFullName}
                      disabled={fullNameSaving || fullName.trim() === (boosterData?.full_name ?? '')}
                      className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {fullNameSaving ? '...' : 'Salvar'}
                    </button>
                  </div>
                  {fullNameSaved && <p className="text-xs text-success">Nome salvo!</p>}
                </div>

                {/* CPF */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">CPF</p>
                  <div className="flex gap-2">
                    <input
                      value={cpf}
                      onChange={e => handleCpfChange(e.target.value)}
                      placeholder="000.000.000-00"
                      className="input-base flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCpf}
                      disabled={cpfSaving || cpf.replace(/\D/g, '').length !== 11}
                      className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {cpfSaving ? '...' : 'Salvar'}
                    </button>
                  </div>
                  {cpfError && <p className="text-xs text-danger">{cpfError}</p>}
                  {cpfSaved && <p className="text-xs text-success">CPF salvo!</p>}
                </div>
              </div>
            </>
          )}

          {/* Discord note */}
          <div className="rounded-xl border border-bg-elevated bg-bg-elevated/30 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Conta Discord</p>
            <p className="text-[11px] text-ink-secondary leading-relaxed">
              Email e senha são gerenciados pelo Discord. Para alterar, abra um ticket no nosso servidor.
            </p>
            <a
              href="https://discord.gg/elopeak"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-brand font-semibold hover:underline"
            >
              Ir para o servidor <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-bg-elevated shrink-0">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-danger/30 text-danger hover:bg-danger/10 transition-colors text-sm font-semibold"
          >
            <LogOut className="h-4 w-4" />
            Sair da conta
          </button>
        </div>
      </aside>
    </>
  )
}
