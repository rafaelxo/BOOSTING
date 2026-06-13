import { useQuery } from '@tanstack/react-query'
import { Settings, Plus } from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import type { Service } from '@/types'

export function AdminServicesPage() {
  const { data: services, isLoading } = useQuery({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').order('sort_order')
      if (error) throw error
      return data as Service[]
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Services & Catalog</h1>
        <Button leftIcon={<Plus className="h-4 w-4" />}>Add Service</Button>
      </div>
      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !services?.length ? <EmptyState icon={Settings} title="No services configured" description="Add services to enable ordering." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-ink">{s.name}</TableCell>
                  <TableCell className="text-xs font-mono capitalize">{s.type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <span className={`badge text-xs ${s.is_active ? 'text-success bg-success/10' : 'text-ink-muted bg-bg-overlay'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>{s.sort_order}</TableCell>
                  <TableCell>
                    <Button size="xs" variant="ghost">Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
