'use client';

import { useGateway } from '@/lib/hooks/useGateway';
import { Badge } from './ui/badge';
import { Activity, Zap } from 'lucide-react';

export function GatewayStatus() {
  const { isConnected, connectionId } = useGateway();

  return (
    <div className="flex items-center gap-2 text-sm">
      {isConnected ? (
        <>
          <Badge variant="success" className="gap-1.5">
            <Zap className="h-3 w-3" />
            Gateway Connected
          </Badge>
          {connectionId && (
            <span className="text-xs text-muted-foreground font-mono">
              {connectionId.slice(0, 8)}
            </span>
          )}
        </>
      ) : (
        <Badge variant="outline" className="gap-1.5">
          <Activity className="h-3 w-3" />
          Connecting...
        </Badge>
      )}
    </div>
  );
}
