import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';
import { ShopifyClient } from '../../lib/shopify-client.js';

export const getProductTool: ShopifyTool = {
  name: 'product_get',
  description: 'Get a product by ID from Shopify',
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
  description: 'Update an existing product in Shopify. Use this to modify product details, pricing, descriptions, etc.',
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
