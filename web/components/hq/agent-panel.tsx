'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import Link from 'next/link';

interface AgentPanelProps {
  agentId: string;
  name: string;
  type: string;
  isOnline: boolean;
  operationCount: number;
  recentOperations: Array<{
    action: string;
    status: string;
    startedAt: string;
  }>;
}

const agentColors: Record<string, string> = {
  product: 'border-l-primary',
  inventory: 'border-l-[#FF6B35]',
  support: 'border-l-[#E85D04]',
};

const agentCapabilities: Record<string, string[]> = {
  product: ['Product Management', 'SEO Optimization', 'Catalog Updates'],
  inventory: ['Stock Monitoring', 'Low Stock Alerts', 'Reorder Management'],
  support: ['Customer Service', 'Tag Management', 'Customer Lookup'],
};

export function AgentPanel({
  agentId,
  name,
  type,
  isOnline,
  operationCount,
  recentOperations,
}: AgentPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = agentColors[type] || 'border-l-primary';
  const capabilities = agentCapabilities[type] || [];
  const lastOp = recentOperations[0];

  return (
    <div className={`border border-white/10 border-l-4 ${borderColor} bg-gradient-to-br from-black/60 to-black/40 backdrop-blur rounded-lg hover:border-white/15 transition-all`}>
      <div className="border-b border-white/10 bg-black/20 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className={`h-3 w-3 rounded-full ${isOnline ? 'bg-primary animate-pulse' : 'bg-gray-600'}`}
              />
              {isOnline && (
                <div className="absolute inset-0 h-3 w-3 rounded-full bg-primary animate-ping opacity-75" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-wide">{name}</h3>
              <p className="text-xs text-gray-500 font-mono">
                {type.toUpperCase()} / {operationCount} operations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={isOnline ? 'default' : 'outline'}
              className="font-mono text-xs"
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Badge>
            <Link href={`/chat/${agentId}`}>
              <Button variant="outline" size="sm" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                Chat
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div>
            <div className="text-xs text-gray-500 font-mono mb-2">LAST OPERATION</div>
            <div className="text-sm text-gray-100">
              {lastOp ? `${lastOp.action} — ${lastOp.status}` : 'No recent operations'}
            </div>
          </div>

          {expanded && (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="text-xs text-gray-500 font-mono">CAPABILITIES</div>
              <div className="grid grid-cols-3 gap-2">
                {capabilities.map((capability, i) => (
                  <div
                    key={i}
                    className="border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono"
                  >
                    {capability}
                  </div>
                ))}
              </div>

              {recentOperations.length > 0 && (
                <>
                  <div className="text-xs text-gray-500 font-mono mt-4">RECENT OPERATIONS</div>
                  <div className="space-y-2">
                    {recentOperations.map((op, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 font-mono">{op.action}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs font-mono ${
                            op.status === 'completed' ? 'text-success border-success/30' :
                            op.status === 'failed' ? 'text-error border-error/30' :
                            'text-warning border-warning/30'
                          }`}
                        >
                          {op.status.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
