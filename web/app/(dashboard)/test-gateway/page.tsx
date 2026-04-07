'use client';

import { useState } from 'react';
import { useGateway } from '@/lib/hooks/useGateway';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Users, Warehouse } from 'lucide-react';

export default function TestGatewayPage() {
  const { isConnected, executeOperation } = useGateway();
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testOperation = async (action: string, params: any, agentType: string) => {
    setLoading(action);
    setResult(null);
    setError(null);

    try {
      const data = await executeOperation('demo-store-1', action, params);
      setResult({ action, data });
      console.log('Operation result:', data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Operation failed:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gateway Testing</h1>
        <p className="text-muted-foreground">Test agentic operations with mock data</p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'success' : 'outline'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Gateway is ready to handle operations' : 'Connecting to Gateway...'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Test Operations */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Product Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Product Agent
            </CardTitle>
            <CardDescription>Test product operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              onClick={() => testOperation('product_list', { limit: 10 }, 'product')}
              disabled={!isConnected || loading !== null}
            >
              {loading === 'product_list' ? 'Loading...' : 'List Products'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                testOperation(
                  'product_create',
                  { title: 'Test Product', price: '29.99', description: 'A test product' },
                  'product'
                )
              }
              disabled={!isConnected || loading !== null}
            >
              {loading === 'product_create' ? 'Creating...' : 'Create Product'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => testOperation('product_get', { productId: '123' }, 'product')}
              disabled={!isConnected || loading !== null}
            >
              {loading === 'product_get' ? 'Loading...' : 'Get Product'}
            </Button>
          </CardContent>
        </Card>

        {/* Inventory Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-warning" />
              Inventory Agent
            </CardTitle>
            <CardDescription>Test inventory operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              onClick={() => testOperation('inventory_get', { productId: '123' }, 'inventory')}
              disabled={!isConnected || loading !== null}
            >
              {loading === 'inventory_get' ? 'Loading...' : 'Get Inventory'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => testOperation('inventory_low_stock', { threshold: 10 }, 'inventory')}
              disabled={!isConnected || loading !== null}
            >
              {loading === 'inventory_low_stock' ? 'Loading...' : 'Low Stock Items'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                testOperation(
                  'inventory_update',
                  { productId: '123', locationId: 'main', quantity: 50 },
                  'inventory'
                )
              }
              disabled={!isConnected || loading !== null}
            >
              {loading === 'inventory_update' ? 'Updating...' : 'Update Stock'}
            </Button>
          </CardContent>
        </Card>

        {/* Customer Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-success" />
              Support Agent
            </CardTitle>
            <CardDescription>Test customer operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              onClick={() => testOperation('customer_list', { limit: 10 }, 'support')}
              disabled={!isConnected || loading !== null}
            >
              {loading === 'customer_list' ? 'Loading...' : 'List Customers'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => testOperation('customer_get', { customerId: '123' }, 'support')}
              disabled={!isConnected || loading !== null}
            >
              {loading === 'customer_get' ? 'Loading...' : 'Get Customer'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                testOperation(
                  'customer_update_tags',
                  { customerId: '123', addTags: ['VIP'] },
                  'support'
                )
              }
              disabled={!isConnected || loading !== null}
            >
              {loading === 'customer_update_tags' ? 'Updating...' : 'Update Tags'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {(result || error) && (
        <Card>
          <CardHeader>
            <CardTitle>{error ? 'Error' : 'Operation Result'}</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-error font-mono text-sm bg-error/10 p-4 rounded">
                {error}
              </div>
            ) : (
              <pre className="text-sm bg-muted p-4 rounded overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
