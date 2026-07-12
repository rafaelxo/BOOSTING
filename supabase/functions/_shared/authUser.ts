import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getAuthUser(authHeader: string | null): Promise<{ user: User; client: ReturnType<typeof createClient> } | null> {
  if (!authHeader) return null

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase auth env not configured')
  }

  const client = createClient(
    supabaseUrl,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null

  return { user, client }
}
