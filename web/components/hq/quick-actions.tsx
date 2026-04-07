'use client';

import { useState } from 'react';
import { Package, Warehouse, Users, TrendingUp, RefreshCw, Loader2 } from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  action: string;
  params: Record<string, any>;
}

const actions: QuickAction[] = [
  {
    icon: <Package className="h-4 w-4" />,
    label: 'List Products',
    action: 'product_list',
    params: { limit: 10 },
  },
  {
    icon: <Warehouse className="h-4 w-4" />,
    label: 'Check Stock',
    action: 'inventory_low_stock',
    params: { threshold: 10 },
  },
  {
    icon: <Users className="h-4 w-4" />,
    label: 'List Customers',
    action: 'customer_list',
    params: { limit: 10 },
  },
  {
    icon: <TrendingUp className="h-4 w-4" />,
    label: 'Get Product',
    action: 'product_get',
    params: {},
  },
];

export function QuickActions() {
  const { isConnected, executeOperation } = useGateway();
  const { activeStoreId } = useActiveStore();
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: QuickAction) => {
    if (!activeStoreId || !isConnected) return;

    setLoading(action.action);
    try {
      await executeOperation(activeStoreId, action.action, action.params);
    } catch (error) {
      console.error('Quick action error:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="border border-white/10 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur">
      <div className="border-b border-white/10 bg-black/20 px-6 py-3">
        <h3 className="text-sm font-bold font-mono tracking-wide">
          QUICK ACTIONS
        </h3>
        <p className="text-xs text-gray-500 font-mono">
          Dispatch agents instantly
        </p>
      </div>

      <div className="p-4 grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <button
            key={action.action}
            onClick={() => handleAction(action)}
            disabled={!isConnected || loading !== null}
            className="group border border-white/10 bg-black/40 hover:bg-black/60 hover:border-primary/50 transition-all p-4 text-left disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                {loading === action.action ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  action.icon
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-mono font-bold">
                  {action.label}
                </div>
                <div className="text-xs text-gray-600 font-mono mt-1">
                  {action.action}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
