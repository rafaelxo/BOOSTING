import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const FALLBACK_POLL_INTERVAL_MS = 15_000

function playCoinSound(context: AudioContext) {
  if (context.state !== 'running') return

  const now = context.currentTime
  const gain = context.createGain()
  const firstTone = context.createOscillator()
  const secondTone = context.createOscillator()

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
  gain.connect(context.destination)

  firstTone.type = 'sine'
  firstTone.frequency.setValueAtTime(880, now)
  firstTone.frequency.exponentialRampToValueAtTime(1_320, now + 0.09)
  firstTone.connect(gain)

  secondTone.type = 'triangle'
  secondTone.frequency.setValueAtTime(1_760, now + 0.07)
  secondTone.frequency.exponentialRampToValueAtTime(2_200, now + 0.18)
  secondTone.connect(gain)

  firstTone.start(now)
  firstTone.stop(now + 0.24)
  secondTone.start(now + 0.07)
  secondTone.stop(now + 0.32)
}

/**
 * Avisa boosters aprovados quando um pedido passa a estar disponível para eles.
 * A view do backend é consultada antes do aviso para respeitar credenciais e
 * exclusividade. O polling cobre quedas temporárias da conexão Realtime.
 */
export function useNewOrderSound() {
  const queryClient = useQueryClient()
  const audioContextRef = useRef<AudioContext | null>(null)
  const knownOrderIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const syncingRef = useRef(false)

  const playNotification = useCallback(() => {
    const context = audioContextRef.current
    if (context) playCoinSound(context)
  }, [])

  const syncVisibleOrders = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true

    try {
      const { data, error } = await supabase
        .from('available_boost_orders')
        .select('id')

      if (error) return

      const nextIds = new Set(
        (data ?? [])
          .map(({ id }) => id)
          .filter((id): id is string => typeof id === 'string'),
      )
      if (!initializedRef.current) {
        knownOrderIdsRef.current = nextIds
        initializedRef.current = true
        return
      }

      const hasNewOrder = [...nextIds].some((id) => !knownOrderIdsRef.current.has(id))
      knownOrderIdsRef.current = nextIds

      if (hasNewOrder) {
        playNotification()
        void queryClient.invalidateQueries({ queryKey: ['available-jobs'] })
      }
    } finally {
      syncingRef.current = false
    }
  }, [playNotification, queryClient])

  useEffect(() => {
    // Browsers only permit sound after a user gesture. Any first click/key in
    // the booster panel silently unlocks the audio context for later alerts.
    const unlockAudio = () => {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext()
      if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume()
      }
    }

    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      const context = audioContextRef.current
      audioContextRef.current = null
      if (context && context.state !== 'closed') void context.close()
    }
  }, [])

  useEffect(() => {
    void syncVisibleOrders()

    const channel = supabase
      .channel('booster-new-order-sound')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'booster_order_events' },
        () => void syncVisibleOrders(),
      )
      .subscribe()

    const interval = window.setInterval(() => void syncVisibleOrders(), FALLBACK_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [syncVisibleOrders])
}
