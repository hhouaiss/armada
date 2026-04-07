'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { useGateway } from '@/lib/hooks/useGateway';
import { useActiveStore } from '@/lib/hooks/useActiveStore';

export function CommandInput() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const { isConnected, executeOperation } = useGateway();
  const { activeStoreId } = useActiveStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeStoreId || !isConnected || isProcessing) return;

    setIsProcessing(true);
    setLastResult(null);

    try {
      const result = await executeOperation(activeStoreId, 'product_list', { limit: 10 });
      setLastResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLastResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setInput('');
    }
  };

  return (
    <div className="border border-white/10 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur">
      <div className="border-b border-white/10 bg-black/20 px-6 py-3">
        <h3 className="text-sm font-bold font-mono tracking-wide">
          COMMAND INPUT
        </h3>
        <p className="text-xs text-gray-500 font-mono">
          {isConnected ? 'Give instructions to your agents' : 'Connect to gateway to send commands'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-mono text-sm">
              &gt;
            </span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnected ? 'Type a command or instruction...' : 'Waiting for gateway connection...'}
              disabled={!isConnected || isProcessing}
              className="w-full bg-black/60 border border-white/10 rounded px-8 py-3 font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!isConnected || isProcessing || !input.trim()}
            className="font-mono gap-2"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            SEND
          </Button>
        </div>

        {lastResult && (
          <div className="mt-4 bg-black/60 border border-white/10 rounded p-3 max-h-32 overflow-y-auto">
            <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{lastResult}</pre>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setInput('List all products')}
            className="text-xs font-mono px-3 py-1 border border-white/10 bg-black/40 hover:border-primary/50 hover:bg-black/60 transition-colors"
          >
            List Products
          </button>
          <button
            type="button"
            onClick={() => setInput('Check low stock items')}
            className="text-xs font-mono px-3 py-1 border border-white/10 bg-black/40 hover:border-primary/50 hover:bg-black/60 transition-colors"
          >
            Check Inventory
          </button>
          <button
            type="button"
            onClick={() => setInput('Show customer list')}
            className="text-xs font-mono px-3 py-1 border border-white/10 bg-black/40 hover:border-primary/50 hover:bg-black/60 transition-colors"
          >
            List Customers
          </button>
        </div>
      </form>
    </div>
  );
}
