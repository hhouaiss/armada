'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Package, TrendingDown, Warehouse, Loader2, Bot } from 'lucide-react';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function InventoryPage() {
  const { activeStoreId, activeStore } = useActiveStore();

  const { data: inventoryData, isLoading } = useSWR(
    activeStoreId ? `/api/stores/${activeStoreId}/inventory` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const inventory = inventoryData?.inventory || [];
  const lowStock = inventoryData?.lowStock || [];
  const outOfStock = inventoryData?.outOfStock || [];
  const stats = inventoryData?.stats;

  if (!activeStore) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <Warehouse className="h-12 w-12 text-muted-foreground/70 mx-auto" />
          <p className="text-muted-foreground font-mono">Connect a Shopify store to see inventory</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">INVENTORY MANAGEMENT</h1>
          <p className="text-muted-foreground mt-1">
            {activeStore.storeName} — Track and manage product stock levels
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">Total Variants</span>
            <Package className="h-5 w-5 text-primary" />
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-3xl font-bold">{stats?.totalItems || 0}</div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">Low Stock</span>
            <TrendingDown className="h-5 w-5 text-warning" />
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-3xl font-bold text-warning">{stats?.lowStockCount || 0}</div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground uppercase tracking-wide">Out of Stock</span>
            <AlertCircle className="h-5 w-5 text-error" />
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="text-3xl font-bold text-error">{stats?.outOfStockCount || 0}</div>
          )}
        </div>
      </div>

      {/* Low Stock Alerts */}
      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div className="bg-background/60 border border-border rounded-lg backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-mono text-warning uppercase">Low Stock Alerts</h3>
            <p className="text-xs text-muted-foreground mt-1">Products that need attention</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Product</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Variant</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">SKU</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Stock</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...outOfStock, ...lowStock].map((item: any, i: number) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">{item.productTitle}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{item.variantTitle}</td>
                    <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{item.sku || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`font-bold font-mono ${item.inventoryQuantity <= 0 ? 'text-error' : 'text-warning'}`}>
                        {item.inventoryQuantity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={item.inventoryQuantity <= 0 ? 'destructive' : 'outline'} className="font-mono text-xs">
                        {item.inventoryQuantity <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Inventory */}
      <div className="bg-background/60 border border-border rounded-lg backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-mono text-muted-foreground uppercase">All Inventory</h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : inventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Bot className="h-10 w-10 text-muted-foreground/70 mb-3" />
            <p className="text-sm text-muted-foreground font-mono">No inventory data</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Product</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Variant</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">SKU</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Stock</th>
                  <th className="px-6 py-3 text-xs font-mono text-muted-foreground uppercase">Price</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">{item.productTitle}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{item.variantTitle}</td>
                    <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{item.sku || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`font-bold font-mono ${
                        item.inventoryQuantity <= 0 ? 'text-error' :
                        item.inventoryQuantity <= 10 ? 'text-warning' :
                        'text-success'
                      }`}>
                        {item.inventoryQuantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono">${item.price}</td>
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
