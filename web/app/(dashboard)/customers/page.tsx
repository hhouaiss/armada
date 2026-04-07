'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Loader2, Bot } from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function CustomersPage() {
  const { activeStoreId, activeStore } = useActiveStore();

  const { data: customersData, isLoading } = useSWR(
    activeStoreId ? `/api/stores/${activeStoreId}/customers?limit=50` : null,
    fetcher
  );

  const { data: statsData } = useSWR(
    activeStoreId ? `/api/stores/${activeStoreId}/stats` : null,
    fetcher
  );

  const customers = customersData?.customers || [];
  const totalCustomers = statsData?.stats?.customers || customers.length;

  if (!activeStore) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <Users className="h-12 w-12 text-muted-foreground/70 mx-auto" />
          <p className="text-muted-foreground font-mono">Connect a Shopify store to see customers</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CUSTOMER MANAGEMENT</h1>
          <p className="text-muted-foreground mt-1">
            {activeStore.storeName} — {totalCustomers.toLocaleString()} customers
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">Total Customers</span>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="text-3xl font-bold">{totalCustomers.toLocaleString()}</div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">Loaded</span>
          </div>
          <div className="text-3xl font-bold">{customers.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Showing first page</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">With Orders</span>
          </div>
          <div className="text-3xl font-bold">
            {customers.filter((c: any) => c.orders_count > 0).length}
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-background/60 border border-border rounded-lg backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-mono text-muted-foreground uppercase">Customers</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Bot className="h-10 w-10 text-muted-foreground/70 mb-3" />
            <p className="text-sm text-muted-foreground font-mono">No customers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Customer</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Email</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Orders</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Total Spent</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Tags</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer: any) => (
                  <tr key={customer.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-primary/30">
                          <AvatarFallback className="bg-primary/20 text-primary font-mono text-xs">
                            {(customer.first_name?.[0] || '') + (customer.last_name?.[0] || '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {customer.first_name} {customer.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            Since {new Date(customer.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{customer.email}</td>
                    <td className="px-6 py-4 text-sm font-mono font-bold">{customer.orders_count || 0}</td>
                    <td className="px-6 py-4 text-sm font-mono font-bold">
                      ${parseFloat(customer.total_spent || '0').toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {customer.tags?.split(',').filter(Boolean).map((tag: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs font-mono">
                            {tag.trim()}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
