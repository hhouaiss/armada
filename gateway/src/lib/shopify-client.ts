import crypto from 'crypto';

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

    return response.json() as Promise<T>;
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

  async getCollection(collectionId: string) {
    return this.request<any>(`/custom_collections/${collectionId}.json`);
  }

  async createCollection(collection: any) {
    return this.request<any>('/custom_collections.json', 'POST', { custom_collection: collection });
  }

  async updateCollection(collectionId: string, collection: any) {
    return this.request<any>(`/custom_collections/${collectionId}.json`, 'PUT', { custom_collection: collection });
  }

  // Blogs & Articles
  async getBlogs() {
    return this.request<any>('/blogs.json');
  }

  async getBlog(blogId: string) {
    return this.request<any>(`/blogs/${blogId}.json`);
  }

  async createBlog(blog: any) {
    return this.request<any>('/blogs.json', 'POST', { blog });
  }

  async getArticles(blogId: string, params?: { limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/blogs/${blogId}/articles.json${query ? `?${query}` : ''}`);
  }

  async createArticle(blogId: string, article: any) {
    return this.request<any>(`/blogs/${blogId}/articles.json`, 'POST', { article });
  }

  async updateArticle(blogId: string, articleId: string, article: any) {
    return this.request<any>(`/blogs/${blogId}/articles/${articleId}.json`, 'PUT', { article });
  }

  // Shop Info
  async getShopInfo() {
    return this.request<any>('/shop.json');
  }

  // Orders
  async getOrder(orderId: string) {
    return this.request<any>(`/orders/${orderId}.json`);
  }

  async listOrders(params?: { status?: string; limit?: number; since_id?: string }) {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.since_id) query.append('since_id', params.since_id);

    return this.request<any>(`/orders.json${query.toString() ? `?${query}` : ''}`);
  }

  // Financial operations (cancel, refund) removed - handled directly in Shopify dashboard
}

// Encryption for storing tokens
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
