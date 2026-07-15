import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, MessageCircle, Send, ShieldCheck, Unlock } from 'lucide-react'
import { Avatar, Button, Card, ErrorAlert, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import type { OrderChatMessage, UserRole } from '@/types'

type OrderChatResponse = {
  success: boolean
  code?: string
  message?: string
  chat_available: boolean
  chat_locked: boolean
  chat_locked_at: string | null
  can_send: boolean
  messages: OrderChatMessage[]
}

type ChatActionResponse = {
  success: boolean
  code?: string
  message?: string
}

const ROLE_LABEL: Record<UserRole, string> = {
  customer: 'Cliente',
  booster: 'Booster',
  admin: 'Admin',
}

function actionError(result: ChatActionResponse, fallback: string) {
  const messages: Record<string, string> = {
    not_authenticated: 'Sua sessao expirou. Entre novamente.',
    order_not_found: 'Pedido nao encontrado ou sem permissao de acesso.',
    chat_unavailable: 'O chat sera liberado quando um booster for atribuido.',
    chat_locked: 'O chat foi bloqueado pela administracao.',
    invalid_content: 'A mensagem deve ter entre 1 e 4000 caracteres.',
    rate_limited: 'Muitas mensagens em pouco tempo. Aguarde um minuto.',
    forbidden: 'Voce nao tem permissao para esta acao.',
  }
  return new Error(messages[result.code ?? ''] ?? result.message ?? fallback)
}

async function loadOrderChat(orderId: string) {
  const { data, error } = await supabase.rpc('get_order_chat', { p_order_id: orderId })
  if (error) throw error
  const result = data as unknown as OrderChatResponse
  if (!result.success) throw actionError(result, 'Nao foi possivel carregar o chat.')
  return result
}

export function OrderChat({ orderId, viewerRole }: { orderId: string; viewerRole: UserRole }) {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const chat = useQuery({
    queryKey: ['order-chat', orderId],
    queryFn: () => loadOrderChat(orderId),
    refetchInterval: 4000,
  })

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase.rpc('send_order_message', {
        p_order_id: orderId,
        p_content: content,
      })
      if (error) throw error
      const result = data as unknown as ChatActionResponse
      if (!result.success) throw actionError(result, 'Nao foi possivel enviar a mensagem.')
    },
    onSuccess: async () => {
      setMessage('')
      await queryClient.invalidateQueries({ queryKey: ['order-chat', orderId] })
    },
  })

  const setLocked = useMutation({
    mutationFn: async (locked: boolean) => {
      const { data, error } = await supabase.rpc('admin_set_order_chat_lock', {
        p_order_id: orderId,
        p_locked: locked,
      })
      if (error) throw error
      const result = data as unknown as ChatActionResponse
      if (!result.success) throw actionError(result, 'Nao foi possivel alterar o bloqueio do chat.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order-chat', orderId] }),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [chat.data?.messages.length])

  function submitMessage() {
    const content = message.trim()
    if (!content || sendMessage.isPending || !chat.data?.can_send) return
    sendMessage.mutate(content)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitMessage()
    }
  }

  if (chat.isLoading) {
    return (
      <Card padding="md" className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full" />
      </Card>
    )
  }

  if (chat.isError || !chat.data) {
    return (
      <Card padding="md">
        <ErrorAlert message={chat.error instanceof Error ? chat.error.message : 'Nao foi possivel carregar o chat.'} />
      </Card>
    )
  }

  const { chat_available: available, chat_locked: locked, messages, can_send: canSend } = chat.data

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-bg-elevated px-4 py-3">
        <MessageCircle className="h-4 w-4 text-brand" />
        <div>
          <h3 className="text-sm font-semibold text-ink">Chat do pedido</h3>
          <p className="text-[11px] text-ink-muted">{messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}</p>
        </div>
        {viewerRole === 'admin' && available && (
          <Button
            className="ml-auto"
            size="sm"
            variant={locked ? 'secondary' : 'danger-ghost'}
            loading={setLocked.isPending}
            onClick={() => setLocked.mutate(!locked)}
            leftIcon={locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          >
            {locked ? 'Desbloquear chat' : 'Bloquear chat'}
          </Button>
        )}
      </div>

      {!available ? (
        <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated">
            <Lock className="h-5 w-5 text-ink-muted" />
          </div>
          <p className="text-sm font-semibold text-ink">Chat ainda indisponivel</p>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">
            Cliente e booster poderao conversar quando um booster for atribuido a este pedido.
          </p>
        </div>
      ) : (
        <>
          {locked && (
            <div className="flex items-start gap-2 border-b border-warning/20 bg-warning/10 px-4 py-3 text-xs text-warning">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Chat bloqueado pela administracao. Somente administradores podem enviar mensagens.</span>
            </div>
          )}

          <div className="min-h-64 max-h-[430px] space-y-4 overflow-y-auto px-4 py-5">
            {messages.length === 0 ? (
              <p className="py-12 text-center text-xs text-ink-muted">Nenhuma mensagem enviada.</p>
            ) : (
              messages.map((item) => {
                const isMe = item.sender_id === profile?.id
                const isAdmin = item.sender_role === 'admin'
                return (
                  <div key={item.id} className={cn('flex items-start gap-2.5', isMe && 'flex-row-reverse')}>
                    <Avatar src={item.sender_avatar_url} name={item.sender_name} size="sm" />
                    <div className={cn('flex max-w-[82%] flex-col', isMe ? 'items-end' : 'items-start')}>
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 px-1 text-[10px] text-ink-muted">
                        <span className="font-semibold text-ink-secondary">{item.sender_name}</span>
                        <span>{ROLE_LABEL[item.sender_role]}</span>
                      </div>
                      <div
                        className={cn(
                          'whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                          isMe && !isAdmin && 'rounded-tr-sm bg-brand text-white',
                          !isMe && !isAdmin && 'rounded-tl-sm bg-bg-elevated text-ink',
                          isAdmin && 'border border-accent/30 bg-accent/10 text-ink',
                        )}
                      >
                        {item.content}
                      </div>
                      <time className="mt-1 px-1 text-[10px] text-ink-muted" dateTime={item.created_at}>
                        {formatDateTime(item.created_at)}
                      </time>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {canSend ? (
            <div className="flex items-end gap-2 border-t border-bg-elevated p-3">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={4000}
                rows={2}
                placeholder={viewerRole === 'admin' && locked ? 'Mensagem administrativa...' : 'Escreva uma mensagem...'}
                className="input-base min-h-11 flex-1 resize-y py-2.5 text-sm"
                disabled={sendMessage.isPending}
              />
              <Button
                size="icon-lg"
                onClick={submitMessage}
                loading={sendMessage.isPending}
                disabled={!message.trim()}
                title="Enviar mensagem"
                aria-label="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          ) : locked ? null : (
            <div className="border-t border-bg-elevated px-4 py-3 text-center text-xs text-ink-muted">
              Voce nao pode enviar mensagens neste chat.
            </div>
          )}
        </>
      )}

      {sendMessage.isError && (
        <div className="border-t border-bg-elevated p-3">
          <ErrorAlert message={sendMessage.error instanceof Error ? sendMessage.error.message : 'Erro ao enviar mensagem.'} />
        </div>
      )}
      {setLocked.isError && (
        <div className="border-t border-bg-elevated p-3">
          <ErrorAlert message={setLocked.error instanceof Error ? setLocked.error.message : 'Erro ao controlar o chat.'} />
        </div>
      )}
    </Card>
  )
}
