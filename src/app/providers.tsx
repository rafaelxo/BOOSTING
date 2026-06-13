import '@/lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

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

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION from localStorage — no extra network call.
    // Using only this avoids the double-fetch caused by calling getSession() separately.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
          setInitialized(true)
        }
      }
    )

    // Safety net: unblock UI if Supabase never responds
    const timeout = setTimeout(() => {
      setLoading(false)
      setInitialized(true)
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(userId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    setProfile(data)
    setLoading(false)
    setInitialized(true)
  }

  return <>{children}</>
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
