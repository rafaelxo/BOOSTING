import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/core/queryKeys'
import {
  getAdminBoosterDetail, getBoosterAccessState, getBoosterPerformanceByRank, getOwnBoosterProfileId,
  getOwnBoosterTop3Status, getOwnProfessionalProfile, getPublicBooster, getTopBoosters, listAdminBoosters,
  listBoostersPerformance, listBoosterNames, listPublicBoosters,
} from './queries'
import { adminApproveBooster, adminToggleBoosterTop3, boosterHeartbeat, onboardBooster, updateProfessionalProfile } from './mutations'

export function useBoosterStatus(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boosters.status(userId ?? ''),
    queryFn: () => getBoosterAccessState(userId!),
    enabled: !!userId,
  })
}

export function useOwnProfessionalProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boosters.profile(userId ?? ''),
    queryFn: () => getOwnProfessionalProfile(userId!),
    enabled: !!userId,
  })
}

export function useOwnBoosterProfileId(userId: string | undefined) {
  return useQuery({
    queryKey: ['boosters', 'own-profile-id', userId ?? ''],
    queryFn: () => getOwnBoosterProfileId(userId!),
    enabled: !!userId,
  })
}

export function useOwnBoosterTop3Status(userId: string | undefined) {
  return useQuery({
    queryKey: ['boosters', 'own-top3-status', userId ?? ''],
    queryFn: () => getOwnBoosterTop3Status(userId!),
    enabled: !!userId,
  })
}

export function usePublicBoosters() {
  return useQuery({
    queryKey: queryKeys.boosters.publicList(),
    queryFn: listPublicBoosters,
    staleTime: 60_000,
  })
}

export function usePublicBooster(boosterId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boosters.publicProfile(boosterId ?? ''),
    queryFn: () => getPublicBooster(boosterId!),
    enabled: !!boosterId,
  })
}

export function useBoostersPerformance(boosterUserIds: string[]) {
  return useQuery({
    queryKey: ['boosters', 'performance', boosterUserIds],
    queryFn: () => listBoostersPerformance(boosterUserIds),
    enabled: boosterUserIds.length > 0,
    staleTime: 60_000,
  })
}

export function useBoosterPerformanceByRank(boosterUserId: string | undefined) {
  return useQuery({
    queryKey: ['boosters', 'performance-by-rank', boosterUserId ?? ''],
    queryFn: () => getBoosterPerformanceByRank(boosterUserId!),
    enabled: !!boosterUserId,
  })
}

export function useTopBoosters(limit: number) {
  return useQuery({
    queryKey: ['boosters', 'top', limit] as const,
    queryFn: () => getTopBoosters({ limit }),
    staleTime: 60_000,
  })
}

export function useAdminBoosters(status?: string) {
  return useQuery({
    queryKey: queryKeys.boosters.adminList({ status }),
    queryFn: () => listAdminBoosters(status),
    refetchInterval: 20_000,
  })
}

export function useAdminBoosterDetail(boosterId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.boosters.adminDetail(boosterId ?? ''),
    queryFn: () => getAdminBoosterDetail(boosterId!),
    enabled: !!boosterId,
    refetchInterval: 20_000,
  })
}

export function useBoosterNames(boosterUserIds: string[]) {
  return useQuery({
    queryKey: ['boosters', 'names', boosterUserIds],
    queryFn: () => listBoosterNames(boosterUserIds),
    enabled: boosterUserIds.length > 0,
  })
}

export function useBoosterHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    void boosterHeartbeat()
    const onVisible = () => { if (document.visibilityState === 'visible') void boosterHeartbeat() }
    const interval = window.setInterval(onVisible, 60_000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}

export function useOnboardBooster(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: onboardBooster,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.boosters.status(userId ?? '') }),
  })
}

export function useUpdateProfessionalProfile(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProfessionalProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.boosters.profile(userId ?? '') })
      void queryClient.invalidateQueries({ queryKey: ['boosters', 'public'] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.boosters.publicList() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.boosters.top() })
    },
  })
}

export function useAdminApproveBooster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminApproveBooster,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['boosters'] }),
  })
}

export function useAdminToggleBoosterTop3() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminToggleBoosterTop3,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['boosters'] }),
  })
}
