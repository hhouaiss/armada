export const api = {
  stores: {
    list: () => fetch('/api/shopify/stores').then((r) => r.json()),
    getProducts: (storeId: string) => fetch(`/api/stores/${storeId}/products`).then((r) => r.json()),
    getInventory: (storeId: string) => fetch(`/api/stores/${storeId}/inventory`).then((r) => r.json()),
    getCustomers: (storeId: string, params?: string) =>
      fetch(`/api/stores/${storeId}/customers${params ? `?${params}` : ''}`).then((r) => r.json()),
    getOrders: (storeId: string, params?: string) =>
      fetch(`/api/stores/${storeId}/orders${params ? `?${params}` : ''}`).then((r) => r.json()),
    getStats: (storeId: string) => fetch(`/api/stores/${storeId}/stats`).then((r) => r.json()),
  },
  operations: {
    list: (storeId?: string, params?: Record<string, string>) => {
      const query = new URLSearchParams(params);
      if (storeId) query.set('storeId', storeId);
      return fetch(`/api/operations?${query}`).then((r) => r.json());
    },
  },
  agents: {
    list: (storeId?: string) =>
      fetch(`/api/agents${storeId ? `?storeId=${storeId}` : ''}`).then((r) => r.json()),
  },
  chat: {
    list: (storeId: string, agentId: string) =>
      fetch(`/api/chat?storeId=${storeId}&agentId=${agentId}`).then((r) => r.json()),
    send: (storeId: string, agentId: string, content: string) =>
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, agentId, content }),
      }).then((r) => r.json()),
  },
};
