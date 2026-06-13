import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'

export function AdminCustomersPage() {
  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('*, profiles(email, username, created_at)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink">Customers</h1>
      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !customers?.length ? <EmptyState icon={Users} title="No customers yet" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Total Orders</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const p = c.profiles as { email: string; username: string; created_at: string } | null
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-ink">{p?.username ?? '—'}</TableCell>
                    <TableCell>{p?.email ?? '—'}</TableCell>
                    <TableCell>{c.total_orders}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(c.total_spent)}</TableCell>
                    <TableCell>{p?.created_at ? formatDate(p.created_at) : '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
