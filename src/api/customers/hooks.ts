import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/core/queryKeys'
import {
  getAdminCustomerDetail, getCustomerDashboardStats, listAdminCustomerOrders, listAdminCustomerReviews,
  listAdminCustomers,
} from './queries'

export function useCustomerDashboardStats(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.profile(customerId ?? '').concat(['dashboard-stats']),
    queryFn: () => getCustomerDashboardStats(customerId!),
    enabled: !!customerId,
    refetchInterval: 30_000,
  })
}

export function useAdminCustomers() {
  return useQuery({
    queryKey: queryKeys.customers.adminList(),
    queryFn: () => listAdminCustomers(),
    refetchInterval: 30_000,
  })
}

export function useAdminCustomerDetail(customerProfileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.adminDetail(customerProfileId ?? ''),
    queryFn: () => getAdminCustomerDetail(customerProfileId!),
    enabled: !!customerProfileId,
    refetchInterval: 20_000,
  })
}

export function useAdminCustomerOrders(customerUserId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.adminDetail(customerUserId ?? '').concat(['orders']),
    queryFn: () => listAdminCustomerOrders(customerUserId!),
    enabled: !!customerUserId,
    refetchInterval: 20_000,
  })
}

export function useAdminCustomerReviews(customerUserId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.adminDetail(customerUserId ?? '').concat(['reviews']),
    queryFn: () => listAdminCustomerReviews(customerUserId!),
    enabled: !!customerUserId,
  })
}
