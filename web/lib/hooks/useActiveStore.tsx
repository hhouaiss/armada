'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Store {
  id: string;
  shopifyDomain: string;
  storeName: string;
  installedAt: string;
  lastSyncAt: string | null;
}

interface StoreContextValue {
  activeStoreId: string | null;
  activeStore: Store | null;
  setActiveStoreId: (id: string) => void;
  stores: Store[];
  isLoading: boolean;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/shopify/stores')
      .then((r) => r.json())
      .then((data) => {
        const storeList = data.stores || [];
        setStores(storeList);

        const saved = localStorage.getItem('activeStoreId');
        if (saved && storeList.some((s: Store) => s.id === saved)) {
          setActiveStoreIdState(saved);
        } else if (storeList.length > 0) {
          setActiveStoreIdState(storeList[0].id);
        }

        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch stores:', err);
        setIsLoading(false);
      });
  }, []);

  const setActiveStoreId = (id: string) => {
    setActiveStoreIdState(id);
    localStorage.setItem('activeStoreId', id);
  };

  const activeStore = stores.find((s) => s.id === activeStoreId) || null;

  const value = {
    activeStoreId,
    activeStore,
    setActiveStoreId,
    stores,
    isLoading,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useActiveStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useActiveStore must be used within StoreProvider');
  }
  return context;
}
