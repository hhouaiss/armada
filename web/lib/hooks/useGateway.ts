'use client';

import { useEffect, useState, useCallback } from 'react';
import { gatewayClient } from '../gateway-client';
import { useActiveStore } from './useActiveStore';

export function useGateway() {
  // Initialise from the singleton's current state — works for secondary callers
  const [isConnected, setIsConnected] = useState(() => gatewayClient.isConnected());
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const { activeStoreId } = useActiveStore();

  useEffect(() => {
    // Listen for connected events from the singleton (handles the case where
    // another hook instance already initiated the connection).
    const onConnected = (msg: any) => {
      setConnectionId(msg.connectionId ?? null);
      setIsConnected(true);
    };
    gatewayClient.on('connected', onConnected);

    if (!activeStoreId) {
      return () => {
        gatewayClient.off('connected', onConnected);
      };
    }

    // If already connected, just subscribe and sync state
    if (gatewayClient.isConnected()) {
      setIsConnected(true);
      gatewayClient.subscribe(activeStoreId);
    } else {
      // Only attempt connect if not already connected or connecting
      gatewayClient
        .connect('default-user')
        .then((connId) => {
          setConnectionId(connId);
          setIsConnected(true);
          console.log('✓ Connected to Gateway:', connId);
          gatewayClient.subscribe(activeStoreId);
        })
        .catch((error) => {
          // "Connection already in progress" is expected when multiple hook
          // instances race — the onConnected listener will update state when ready.
          if (!String(error?.message).includes('already in progress')) {
            console.error('Failed to connect to Gateway:', error);
          }
        });
    }

    return () => {
      gatewayClient.off('connected', onConnected);
    };
  }, [activeStoreId]);

  const executeOperation = useCallback(
    async (
      storeId: string,
      action: string,
      params: Record<string, any>,
      agentId?: string
    ) => {
      if (!isConnected) {
        throw new Error('Gateway not connected');
      }

      return gatewayClient.executeOperation(storeId, action, params, agentId);
    },
    [isConnected]
  );

  const subscribe = useCallback((storeId: string) => {
    gatewayClient.subscribe(storeId);
  }, []);

  const sendChatMessage = useCallback(
    async (
      agentId: string,
      message: string,
      conversationId?: string,
      attachments?: Array<{ type: 'image'; mediaType: string; data: string; name?: string }>
    ) => {
      if (!activeStoreId) {
        throw new Error('No active store');
      }
      if (!isConnected) {
        throw new Error('Gateway not connected');
      }

      return gatewayClient.sendChatMessage(
        activeStoreId,
        agentId,
        message,
        conversationId,
        attachments
      );
    },
    [activeStoreId, isConnected]
  );

  return {
    isConnected,
    connectionId,
    executeOperation,
    subscribe,
    sendChatMessage,
    client: gatewayClient,
  };
}
