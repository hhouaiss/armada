import { NextResponse } from 'next/server';

// The gateway serves HTTP + WebSocket on the same port (default 18790).
const GATEWAY_HTTP_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:18790';

/**
 * Proxy to the gateway's live MCP reconciliation:
 *  - POST → gateway reconnects/disconnects MCP servers per the Integration
 *    table and returns their real status (no restart needed).
 *  - GET  → current status without forcing a sync.
 */
export async function POST() {
  try {
    const res = await fetch(`${GATEWAY_HTTP_URL}/api/mcp/sync`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'Gateway injoignable — vérifiez qu\'il est démarré.', servers: [] },
      { status: 502 }
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY_HTTP_URL}/api/mcp/status`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'Gateway injoignable', servers: [] },
      { status: 502 }
    );
  }
}
