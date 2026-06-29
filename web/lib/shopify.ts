import crypto from 'crypto';

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  hostName: string;
}

export class ShopifyClient {
  private domain: string;
  private accessToken: string;
  private apiVersion = '2024-01';

  constructor(domain: string, accessToken: string) {
    this.domain = domain;
    this.accessToken = accessToken;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const url = `https://${this.domain}/admin/api/${this.apiVersion}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Products
  async getProducts(params?: { limit?: number; fields?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/products.json${query ? `?${query}` : ''}`);
  }

  async getProduct(productId: string) {
    return this.request<any>(`/products/${productId}.json`);
  }

  async createProduct(product: any) {
    return this.request<any>('/products.json', 'POST', { product });
  }

  async updateProduct(productId: string, product: any) {
    return this.request<any>(`/products/${productId}.json`, 'PUT', { product });
  }

  async deleteProduct(productId: string) {
    return this.request<any>(`/products/${productId}.json`, 'DELETE');
  }

  // Inventory
  async getInventoryLevels(params?: { location_ids?: string[]; inventory_item_ids?: string[] }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/inventory_levels.json${query ? `?${query}` : ''}`);
  }

  async updateInventoryLevel(params: {
    location_id: string;
    inventory_item_id: string;
    available: number;
  }) {
    return this.request<any>('/inventory_levels/set.json', 'POST', params);
  }

  // Orders
  async getOrders(params?: { limit?: number; status?: string; financial_status?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/orders.json${query ? `?${query}` : ''}`);
  }

  async getOrder(orderId: string) {
    return this.request<any>(`/orders/${orderId}.json`);
  }

  async fulfillOrder(orderId: string, fulfillment: any) {
    return this.request<any>(`/orders/${orderId}/fulfillments.json`, 'POST', { fulfillment });
  }

  // Customers
  async getCustomers(params?: { limit?: number; fields?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/customers.json${query ? `?${query}` : ''}`);
  }

  async getCustomer(customerId: string) {
    return this.request<any>(`/customers/${customerId}.json`);
  }

  async updateCustomer(customerId: string, customer: any) {
    return this.request<any>(`/customers/${customerId}.json`, 'PUT', { customer });
  }

  // Collections
  async getCollections() {
    return this.request<any>('/custom_collections.json');
  }

  async createCollection(collection: any) {
    return this.request<any>('/custom_collections.json', 'POST', { custom_collection: collection });
  }

  // Count endpoints
  async getProductCount(): Promise<{ count: number }> {
    return this.request('/products/count.json');
  }

  async getCustomerCount(): Promise<{ count: number }> {
    return this.request('/customers/count.json');
  }

  async getOrderCount(params?: { status?: string }): Promise<{ count: number }> {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/orders/count.json${query ? `?${query}` : ''}`);
  }

  // Shop
  async getShopInfo(): Promise<{ shop: any }> {
    return this.request('/shop.json');
  }
}

// OAuth helpers
export function generateAuthUrl(config: ShopifyConfig, shop: string, state: string): string {
  const scopes = config.scopes.join(',');
  const redirectUri = `${config.hostName}/api/shopify/callback`;

  return `https://${shop}/admin/oauth/authorize?client_id=${config.apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
}

export async function exchangeCodeForToken(
  config: ShopifyConfig,
  shop: string,
  code: string
): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  const data = await response.json();
  return data.access_token;
}

export function verifyHmac(query: Record<string, string>, secret: string): boolean {
  const { hmac, ...params } = query;

  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const hash = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return hash === hmac;
}

// Encryption for storing tokens
export function encryptToken(token: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

export function decryptToken(encryptedToken: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
