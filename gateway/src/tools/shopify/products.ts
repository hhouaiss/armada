import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';
import { ShopifyClient } from '../../lib/shopify-client.js';

export const getProductTool: ShopifyTool = {
  name: 'product_get',
  description:
    'Get a product by ID from Shopify. If you only have the product name, use product_search first to find its ID.',
  category: 'products',
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'The Shopify product ID' },
    },
    required: ['productId'],
  },

  async execute(params: { productId: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getProduct(params.productId);
      return { success: true, data: response.product };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  },
};

export const listProductsTool: ShopifyTool = {
  name: 'product_list',
  description: 'List all products from Shopify with optional filters',
  category: 'products',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of products to return (default 20)' },
    },
  },

  async execute(params: { limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getProducts({ limit: params.limit || 20 });
      return { success: true, data: { products: response.products, total: response.products.length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list products' };
    }
  },
};

// Accent-insensitive, case-insensitive normalization for fuzzy matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const searchProductsTool: ShopifyTool = {
  name: 'product_search',
  description:
    'Find products by name (full or partial, typos and accents tolerated). ' +
    'ALWAYS use this first when the user mentions a product by its name — ' +
    'never ask the user for a product ID or handle. Returns matching products ' +
    'with their IDs so you can then call product_get / product_update.',
  category: 'products',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The product name or part of it, as the user said it' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    required: ['name'],
  },

  async execute(params: { name: string; limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const limit = params.limit ?? 10;
      const term = params.name.trim();

      // 1. Shopify server-side search: wildcard on title, then full-text
      const escaped = term.replace(/["\\]/g, '\\$&');
      for (const q of [`title:*${escaped}*`, escaped]) {
        const { products } = await client.searchProducts(q, limit);
        if (products.length > 0) {
          return { success: true, data: { products, total: products.length, matchType: 'shopify' } };
        }
      }

      // 2. Fuzzy fallback: fetch the catalog and score client-side
      // (handles accents, word order, and partial words that Shopify misses)
      const { products: all } = await client.getProducts({ limit: 100 });
      const queryTokens = normalize(term).split(' ').filter(Boolean);
      const scored = all
        .map((p: any) => {
          const title = normalize(p.title ?? '');
          const matched = queryTokens.filter(
            (t) => title.includes(t) || title.split(' ').some((w: string) => w.startsWith(t.slice(0, 4)))
          );
          return { product: p, score: queryTokens.length ? matched.length / queryTokens.length : 0 };
        })
        .filter((s) => s.score >= 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (scored.length > 0) {
        return {
          success: true,
          data: { products: scored.map((s) => s.product), total: scored.length, matchType: 'fuzzy' },
        };
      }

      return {
        success: true,
        data: {
          products: [],
          total: 0,
          hint: `Aucun produit trouvé pour "${term}". Suggestions proches indisponibles — utilise product_list pour voir le catalogue.`,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to search products' };
    }
  },
};

export const createProductTool: ShopifyTool = {
  name: 'product_create',
  description: 'Create a new product in Shopify. Use this when the user asks to add a new product to their store.',
  category: 'products',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The product title' },
      description: { type: 'string', description: 'The product description (HTML allowed)' },
      price: { type: 'string', description: 'The product price' },
      vendor: { type: 'string', description: 'The product vendor' },
    },
    required: ['title'],
  },

  validate(params: any) {
    if (!params.title) return { valid: false, errors: ['Title is required'] };
    return { valid: true };
  },

  async execute(params: { title: string; price?: string; description?: string; vendor?: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const product = {
        title: params.title,
        body_html: params.description || '',
        vendor: params.vendor || '',
        product_type: 'General',
        variants: params.price ? [{ price: params.price, inventory_management: 'shopify', inventory_quantity: 0 }] : undefined,
      };
      const response = await client.createProduct(product);
      return { success: true, data: response.product };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create product' };
    }
  },
};

export const updateProductTool: ShopifyTool = {
  name: 'product_update',
  description:
    'Update an existing product in Shopify. Use this to modify product details, pricing, descriptions, etc. ' +
    'If you only have the product name, use product_search first to find its ID.',
  category: 'products',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'The Shopify product ID to update' },
      title: { type: 'string', description: 'New product title' },
      description: { type: 'string', description: 'New product description' },
      price: { type: 'string', description: 'New product price' },
      vendor: { type: 'string', description: 'New product vendor' },
      status: { type: 'string', description: 'Product status', enum: ['active', 'draft', 'archived'] },
    },
    required: ['productId'],
  },

  async execute(params: { productId: string; title?: string; description?: string; price?: string; vendor?: string; status?: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const updates: any = {};
      if (params.title) updates.title = params.title;
      if (params.description) updates.body_html = params.description;
      if (params.vendor) updates.vendor = params.vendor;
      if (params.status) updates.status = params.status;
      const response = await client.updateProduct(params.productId, updates);
      return { success: true, data: response.product };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update product' };
    }
  },
};
