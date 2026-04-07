'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Store, Plus, ExternalLink, RefreshCw } from 'lucide-react';

interface StoreData {
  id: string;
  shopifyDomain: string;
  storeName: string;
  installedAt: string;
  lastSyncAt: string | null;
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const response = await fetch('/api/shopify/stores');
      const data = await response.json();
      setStores(data.stores || []);
    } catch (error) {
      console.error('Error fetching stores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    const shop = prompt('Enter your Shopify store domain (e.g., mystore.myshopify.com):');
    if (shop) {
      window.location.href = `/api/shopify/install?shop=${shop}`;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-background/60 backdrop-blur-sm px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              CONNECTED STORES
            </h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              Manage your Shopify store connections
            </p>
          </div>
          <Button onClick={handleConnect} className="font-mono gap-2">
            <Plus className="h-4 w-4" />
            CONNECT STORE
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground font-mono">Loading stores...</p>
          </div>
        ) : stores.length === 0 ? (
          <div className="border border-border bg-gradient-to-br from-background/60 to-background/40 backdrop-blur p-12 text-center">
            <Store className="h-16 w-16 mx-auto mb-4 text-muted-foreground/70" />
            <h3 className="text-xl font-bold font-mono mb-2">No stores connected</h3>
            <p className="text-muted-foreground font-mono mb-6">
              Connect your first Shopify store to get started
            </p>
            <Button onClick={handleConnect} className="font-mono gap-2">
              <Plus className="h-4 w-4" />
              CONNECT SHOPIFY STORE
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {stores.map((store) => (
              <div
                key={store.id}
                className="border border-border bg-gradient-to-br from-background/60 to-background/40 backdrop-blur"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-primary/10 border border-primary/20">
                        <Store className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold font-mono">{store.storeName}</h3>
                        <p className="text-sm text-muted-foreground font-mono">{store.shopifyDomain}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="success" className="font-mono text-xs">
                            CONNECTED
                          </Badge>
                          <span className="text-xs text-muted-foreground/70 font-mono">
                            Installed:{' '}
                            {new Date(store.installedAt).toLocaleDateString()}
                          </span>
                          {store.lastSyncAt && (
                            <>
                              <span className="text-muted-foreground/50">•</span>
                              <span className="text-xs text-muted-foreground/70 font-mono">
                                Last sync:{' '}
                                {new Date(store.lastSyncAt).toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono gap-2"
                        onClick={() => window.open(`https://${store.shopifyDomain}/admin`, '_blank')}
                      >
                        ADMIN
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="font-mono">
                        SYNC
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
