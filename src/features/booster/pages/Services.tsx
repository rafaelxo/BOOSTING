import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { BoosterProfessionalProfileForm } from '@/features/booster/components/BoosterProfessionalProfileForm'
import { BoosterServicesList } from '@/features/booster/components/BoosterServicesList'

export function BoosterServicesPage() {
  const { profile } = useAuthStore()

  // A rota pública usa booster_profiles.id (não o user_id) — busca só para o link de preview.
  const { data: boosterProfileId } = useQuery({
    queryKey: ['booster-profile-id', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('id')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
    enabled: !!profile?.id,
  })

  if (!profile) return null

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink">Serviços</h1>
        {boosterProfileId && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/boosters/${boosterProfileId}`} target="_blank" rel="noopener noreferrer">
              <Eye className="h-4 w-4" />
              Visualizar como cliente
            </Link>
          </Button>
        )}
      </div>

      <BoosterProfessionalProfileForm userId={profile.id} />
      <BoosterServicesList userId={profile.id} />
    </div>
  )
}
