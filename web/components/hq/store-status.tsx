'use client';

import { TrendingUp, Package, ShoppingCart, AlertCircle, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function StoreStatus() {
  const { activeStoreId, activeStore } = useActiveStore();

  const { data, isLoading } = useSWR(
    activeStoreId ? `/api/stores/${activeStoreId}/stats` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const stats = data?.stats;

  if (!activeStore) {
    return (
      <div className="border border-white/10 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="p-6 text-center">
          <p className="text-sm text-gray-500 font-mono">Connect a Shopify store to see stats</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-white/10 bg-gradient-to-r from-primary/5 to-transparent">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-mono">
              {activeStore.storeName.toUpperCase()} OPERATIONS
            </h2>
            <p className="text-sm text-gray-500 font-mono">
              {activeStore.shopifyDomain}
            </p>
          </div>
          <div className="flex items-center gap-6">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            ) : (
              <>
                <div className="text-center">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-500" />
                    <span className="text-2xl font-bold font-mono">
                      {stats?.products?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 font-mono">PRODUCTS</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-gray-500" />
                    <span className="text-2xl font-bold font-mono">
                      {stats?.orders?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 font-mono">ORDERS</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-gray-500" />
                    <span className="text-2xl font-bold font-mono">
                      {stats?.customers?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 font-mono">CUSTOMERS</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
