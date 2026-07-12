import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock } from 'lucide-react'
import { Button, Card, FormField, Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const passwordSchema = z.object({
  newPassword: z.string().min(8),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  path: ['confirmPassword'],
})

type PasswordData = z.infer<typeof passwordSchema>

// Shared "definir / alterar senha" card — every role can optionally set a
// password to sign in with email besides Discord OAuth.
export function PasswordCard() {
  const [passwordSaved, setPasswordSaved] = useState(false)

  const passwordForm = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema),
  })

  async function onPasswordSave(data: PasswordData) {
    const { error } = await supabase.auth.updateUser({ password: data.newPassword })
    if (!error) {
      passwordForm.reset()
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 3000)
    }
  }

  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
        <Lock className="h-4 w-4 text-ink-secondary" />
        Definir / Alterar Senha
      </h3>
      <p className="text-xs text-ink-muted mb-4">
        Opcional. Permite entrar com e-mail e senha além do Discord.
      </p>

      <form onSubmit={passwordForm.handleSubmit(onPasswordSave)} className="space-y-4">
        <FormField label="Nova senha" error={passwordForm.formState.errors.newPassword?.message} required>
          <Input type="password" placeholder="Mínimo 8 caracteres" error={!!passwordForm.formState.errors.newPassword} {...passwordForm.register('newPassword')} />
        </FormField>
        <FormField label="Confirmar senha" error={passwordForm.formState.errors.confirmPassword?.message} required>
          <Input type="password" placeholder="••••••••" error={!!passwordForm.formState.errors.confirmPassword} {...passwordForm.register('confirmPassword')} />
        </FormField>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" loading={passwordForm.formState.isSubmitting}>
            Salvar Senha
          </Button>
          {passwordSaved && <span className="text-sm text-success">Senha salva com sucesso!</span>}
        </div>
      </form>
    </Card>
  )
}
