import '@/lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { useAuthStore } from '@/stores/authStore'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,       // 2 min
      gcTime: 1000 * 60 * 10,         // 10 min
      retry: (failureCount, error) => {
        // Don't retry on 4xx
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status: number }).status
          if (status >= 400 && status < 500) return false
        }
        return failureCount < 2
      },
    },
  },
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setSession, setProfile, setLoading, setInitialized } = useAuthStore()
  const discordJoinInFlight = useRef(false)
  const [discordJoinNotice, setDiscordJoinNotice] = useState<string | null>(null)

  useEffect(() => {
    let initialized = false

    // Resolve session immediately from cache — no network needed for logged-out users
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (initialized) return
      setSession(session)
      if (session?.user) {
        const displayName = (session.user.user_metadata?.name ?? session.user.user_metadata?.full_name) as string | undefined
        fetchProfile(session.user.id, displayName)
      } else {
        setProfile(null)
        setLoading(false)
        setInitialized(true)
        initialized = true
      }
    })

    // Subscribe to future auth state changes (sign in / sign out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') return // Handled by getSession() above
        setSession(session)
        if (session?.user) {
          if (event === 'SIGNED_IN') {
            const provider = (session.user.app_metadata as Record<string, string>).provider
            if (provider === 'discord') joinDiscordServer(session.user.id, session.provider_token)
          }
          const displayName = (session.user.user_metadata?.name ?? session.user.user_metadata?.full_name) as string | undefined
          await fetchProfile(session.user.id, displayName)
        } else {
          setProfile(null)
          setLoading(false)
          setInitialized(true)
          initialized = true
          // Drop every cached query (orders, notifications, admin lists,
          // etc.) on sign-out. Most keys already include the user id, so
          // this isn't an active cross-account leak today, but it removes
          // the category of risk entirely for shared/library devices and
          // for any future query key that forgets to scope by user.
          queryClient.clear()
          // Descarta também qualquer pedido em construção (Riot ID, notas,
          // seleções) — o store do order builder é em memória e não some
          // sozinho num SPA sem reload, então sem isso os dados de um pedido
          // do usuário anterior vazariam pra quem logar em seguida na aba.
          useOrderBuilderStore.getState().reset()
        }
      }
    )

    // Safety net: unblock UI if Supabase never responds within 3s
    const timeout = setTimeout(() => {
      setLoading(false)
      setInitialized(true)
      initialized = true
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(userId: string, displayName?: string) {
    setLoading(true)
    const { data: initialData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    let data = initialData

    if (error) {
      // Real failure (RLS, rede, etc.) — não mascarar como "perfil ausente".
      // Detalhe do erro (código/policy do Postgrest) só em dev — em produção
      // isso não deve vazar pra um monitor de erros externo.
      if (import.meta.env.DEV) console.error('fetchProfile: failed to load profile', error)
      setProfile(null)
      setLoading(false)
      setInitialized(true)
      return
    }

    if (!data) {
      // Profile missing (Discord OAuth trigger may have failed) — create via RPC
      await supabase.rpc('ensure_profile_exists', { p_display_name: displayName ?? undefined })
      const result = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (result.error) {
        if (import.meta.env.DEV) console.error('fetchProfile: failed to load profile after ensure_profile_exists', result.error)
        setProfile(null)
        setLoading(false)
        setInitialized(true)
        return
      }
      data = result.data
    }

    if (data) {
      setProfile(data)
    }
    setLoading(false)
    setInitialized(true)
  }

  function discordJoinMessage(error: EdgeFunctionError) {
    switch (error.code) {
      case 'DISCORD_TOKEN_MISSING':
        return 'Não recebemos o token OAuth do Discord. Entre novamente pelo Discord para entrar no servidor.'
      case 'DISCORD_TOKEN_EXPIRED':
      case 'DISCORD_TOKEN_INVALID':
        return 'Seu token do Discord expirou. Entre novamente pelo Discord para entrar no servidor.'
      case 'DISCORD_SCOPE_MISSING':
        return 'O login do Discord não concedeu a permissão guilds.join. Entre novamente aceitando as permissões.'
      case 'DISCORD_BOT_NOT_IN_GUILD':
        return 'O bot do Discord não está no servidor configurado.'
      case 'DISCORD_GUILD_INVALID':
        return 'O servidor do Discord configurado é inválido.'
      case 'DISCORD_ALREADY_MEMBER':
        return 'Você já está no servidor do Discord.'
      case 'RATE_LIMITED':
      case 'DISCORD_RATE_LIMITED':
        return 'O Discord limitou temporariamente a entrada no servidor. Vamos tentar novamente uma vez.'
      case 'NETWORK_ERROR':
        return 'Não foi possível conectar à função do Discord. Em desenvolvimento, verifique se as Edge Functions locais estão rodando.'
      default:
        return error.status >= 500
          ? 'Falha interna ao entrar no servidor do Discord.'
          : error.message
    }
  }

  async function joinDiscordServer(userId: string, providerToken?: string | null) {
    const storageKey = `discord-join-server:${userId}:completed`
    if (sessionStorage.getItem(storageKey) === 'true' || discordJoinInFlight.current) return

    if (!providerToken) {
      // provider_token só existe no instante exato do redirect de volta do
      // OAuth -- qualquer outro disparo de SIGNED_IN (nova aba, sincronização
      // de sessão entre abas, reinicialização do client) legitimamente não
      // tem esse token, sem que a sessão do usuário esteja quebrada. Tratar
      // isso como erro ("entre novamente pelo Discord") é alarme falso: não
      // marca como concluído (pra tentar de novo na próxima janela real de
      // SIGNED_IN com token), só não incomoda o usuário à toa.
      if (import.meta.env.DEV) console.warn('joinDiscordServer: sem provider_token, pulando silenciosamente')
      return
    }

    discordJoinInFlight.current = true
    try {
      await invokeEdgeFunction('discord-join-server', {
        body: { discord_access_token: providerToken },
        timeoutMs: 15_000,
      })
      sessionStorage.setItem(storageKey, 'true')
      setDiscordJoinNotice(null)
    } catch (err) {
      if (err instanceof EdgeFunctionError && err.status === 429) {
        setDiscordJoinNotice(discordJoinMessage(err))
        const retryAfterMs = Math.max(1, err.retryAfter ?? 5) * 1000
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
        try {
          await invokeEdgeFunction('discord-join-server', {
            body: { discord_access_token: providerToken },
            timeoutMs: 15_000,
          })
          sessionStorage.setItem(storageKey, 'true')
          setDiscordJoinNotice(null)
        } catch (retryErr) {
          sessionStorage.setItem(storageKey, 'true')
          setDiscordJoinNotice(retryErr instanceof EdgeFunctionError ? discordJoinMessage(retryErr) : 'Falha interna ao entrar no servidor do Discord.')
        }
        return
      }

      if (err instanceof EdgeFunctionError) {
        sessionStorage.setItem(storageKey, 'true')
        setDiscordJoinNotice(discordJoinMessage(err))
      } else {
        setDiscordJoinNotice('Falha interna ao entrar no servidor do Discord.')
      }
    } finally {
      discordJoinInFlight.current = false
    }
  }

  return (
    <>
      {children}
      {discordJoinNotice && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border border-bg-elevated bg-bg-card px-4 py-3 text-sm text-ink shadow-lg">
          {discordJoinNotice}
        </div>
      )}
    </>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
