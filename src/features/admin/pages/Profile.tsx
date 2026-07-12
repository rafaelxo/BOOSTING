import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { User, Mail } from 'lucide-react'
import { Button, Card, FormField, Input, Avatar } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { AvatarIconPicker } from '@/components/profile/AvatarIconPicker'
import { PasswordCard } from '@/components/profile/PasswordCard'

const profileSchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
})

type ProfileData = z.infer<typeof profileSchema>

export function AdminProfilePage() {
  const { profile, setProfile } = useAuthStore()
  const [profileSaved, setProfileSaved] = useState(false)

  const profileForm = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: profile?.username ?? '' },
  })

  async function onProfileSave(data: ProfileData) {
    if (!profile) return
    const { data: result, error } = await supabase.rpc('update_my_username', { p_username: data.username })
    if (error) {
      profileForm.setError('username', { message: 'Erro ao salvar' })
      return
    }
    const res = result as { success: boolean; error?: string }
    if (!res.success) {
      profileForm.setError('username', {
        message: res.error === 'username_taken' ? 'Este nome já está em uso' : 'Erro ao salvar',
      })
      return
    }
    setProfile({ ...profile, username: data.username })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 3000)
  }

  async function handleSelectIcon(url: string) {
    if (!profile) return
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    setProfile({ ...profile, avatar_url: url })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Meu Perfil</h1>

      <Card padding="md">
        <div className="flex items-center gap-4 mb-6">
          <Avatar src={profile?.avatar_url} name={profile?.username} size="xl" />
          <div>
            <p className="font-semibold text-ink">{profile?.username}</p>
            <p className="text-sm text-ink-secondary">{profile?.email}</p>
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger uppercase tracking-wide">
              Admin
            </span>
          </div>
        </div>

        <form onSubmit={profileForm.handleSubmit(onProfileSave)} className="space-y-4">
          <FormField label="Nome de usuário" error={profileForm.formState.errors.username?.message} required>
            <Input
              leftElement={<User className="h-4 w-4" />}
              error={!!profileForm.formState.errors.username}
              {...profileForm.register('username')}
            />
          </FormField>

          <FormField label="Email">
            <Input type="email" value={profile?.email} leftElement={<Mail className="h-4 w-4" />} disabled />
            <p className="text-xs text-ink-muted mt-1">Gerenciado pela sua conta Discord.</p>
          </FormField>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={profileForm.formState.isSubmitting}>Salvar</Button>
            {profileSaved && <span className="text-sm text-success">Salvo!</span>}
          </div>
        </form>
      </Card>

      <Card padding="md">
        <AvatarIconPicker currentUrl={profile?.avatar_url} onSelect={handleSelectIcon} />
      </Card>

      <PasswordCard />
    </div>
  )
}
