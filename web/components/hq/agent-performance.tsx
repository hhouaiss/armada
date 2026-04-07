'use client';

import { Clock, CheckCircle2, TrendingUp, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function AgentPerformance() {
  const { activeStoreId } = useActiveStore();

  const { data, isLoading } = useSWR(
    activeStoreId ? `/api/agents?storeId=${activeStoreId}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const agents = data?.agents || [];

  return (
    <div className="border border-white/10 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur">
      <div className="border-b border-white/10 bg-black/20 px-6 py-3">
        <h3 className="text-sm font-bold font-mono tracking-wide">
          AGENT PERFORMANCE
        </h3>
        <p className="text-xs text-gray-500 font-mono">Live metrics</p>
      </div>

      <div className="p-6 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        )}

        {!isLoading && agents.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-600 font-mono">No agents configured</p>
          </div>
        )}

        {agents.map((agent: any) => {
          const totalOps = agent._count?.operations || 0;
          const recentOps = agent.operations || [];
          const completedOps = recentOps.filter((o: any) => o.status === 'completed');
          const successRate = recentOps.length > 0
            ? Math.round((completedOps.length / recentOps.length) * 100)
            : 100;
          const avgDuration = completedOps.length > 0
            ? (completedOps.reduce((sum: number, o: any) => sum + (o.duration || 0), 0) / completedOps.length / 1000).toFixed(1)
            : '—';

          return (
            <div
              key={agent.id}
              className="border border-white/10 bg-black/40 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono font-bold text-sm">
                  {agent.name?.toUpperCase() || agent.type?.toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${agent.isOnline ? 'bg-success animate-pulse' : 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-500 font-mono">
                    {agent.isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    <span className="text-xs text-gray-600 font-mono">TASKS</span>
                  </div>
                  <div className="text-lg font-bold font-mono">{totalOps}</div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-3 w-3 text-primary" />
                    <span className="text-xs text-gray-600 font-mono">AVG TIME</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {avgDuration === '—' ? '—' : `${avgDuration}s`}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-3 w-3 text-success" />
                    <span className="text-xs text-gray-600 font-mono">SUCCESS</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-success">
                    {successRate}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
