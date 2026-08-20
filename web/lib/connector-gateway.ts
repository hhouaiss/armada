const GATEWAY_HTTP_URL = process.env.GATEWAY_HTTP_URL || 'http://localhost:18790';

export async function syncConnectorGateway() {
  const response = await fetch(`${GATEWAY_HTTP_URL}/api/mcp/sync`, {
    method: 'POST', cache: 'no-store',
    headers: process.env.CONNECTOR_RUNNER_TOKEN ? { Authorization: `Bearer ${process.env.CONNECTOR_RUNNER_TOKEN}` } : undefined,
  });
  if (!response.ok) throw new Error('Gateway connector sync failed');
  return response.json();
}
