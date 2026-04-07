'use client';

import { Circle, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type TimeGroup = 'NOW' | 'EARLIER TODAY' | 'YESTERDAY' | 'OLDER';

interface Operation {
  id: string;
  action: string;
  status: string;
  startedAt: string;
  agent?: { name: string; type: string };
}

export function ActivityFeed() {
  const { activeStoreId } = useActiveStore();

  const { data, isLoading } = useSWR(
    activeStoreId ? `/api/operations?storeId=${activeStoreId}&limit=20` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const operations: Operation[] = data?.operations || [];

  const statusColors: Record<string, string> = {
    completed: 'text-success',
    processing: 'text-primary',
    pending: 'text-warning',
    failed: 'text-error',
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1m ago';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getTimeGroup = (dateStr: string): TimeGroup => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 10) return 'NOW';
    if (hours < 24) return 'EARLIER TODAY';
    if (hours < 48) return 'YESTERDAY';
    return 'OLDER';
  };

  const groupOperations = () => {
    const grouped: Record<TimeGroup, Operation[]> = {
      'NOW': [],
      'EARLIER TODAY': [],
      'YESTERDAY': [],
      'OLDER': [],
    };

    operations.forEach(op => {
      const group = getTimeGroup(op.startedAt);
      grouped[group].push(op);
    });

    return grouped;
  };

  const grouped = groupOperations();

  return (
    <div className="border border-white/10 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur rounded-lg">
      <div className="border-b border-white/10 bg-black/20 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-wide">ACTIVITY FEED</h3>
            <p className="text-xs text-gray-500">Real-time operations</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        )}

        {!isLoading && operations.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-gray-600 font-mono">No operations yet</p>
          </div>
        )}

        {!isLoading && (Object.keys(grouped) as TimeGroup[]).map((group) => {
          const items = grouped[group];
          if (items.length === 0) return null;

          return (
            <div key={group} className="space-y-2">
              <h4 className="text-xs font-mono text-gray-500 uppercase px-2">
                {group}
              </h4>
              {items.map((op) => (
                <div
                  key={op.id}
                  className="group border-l-2 border-white/10 pl-4 py-2 hover:border-primary hover:bg-white/5 rounded-r transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Circle
                          className={`h-2 w-2 fill-current ${statusColors[op.status] || 'text-gray-500'}`}
                        />
                        <span className="text-xs font-mono font-bold text-gray-400">
                          {op.agent?.name?.toUpperCase() || op.agent?.type?.toUpperCase() || 'SYSTEM'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-200">{op.action}</p>
                    </div>
                    <span className="text-xs text-gray-600 font-mono whitespace-nowrap">
                      {formatTime(op.startedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-mono">{operations.length} events</span>
        </div>
      </div>
    </div>
  );
}
