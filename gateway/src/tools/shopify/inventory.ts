import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';
import { ShopifyClient } from '../../lib/shopify-client.js';

export const getInventoryTool: ShopifyTool = {
  name: 'inventory_get',
  description: 'Get inventory levels for a product by inventory item ID',
  category: 'inventory',
  inputSchema: {
    type: 'object',
    properties: {
      inventoryItemId: { type: 'string', description: 'The inventory item ID' },
    },
    required: ['inventoryItemId'],
  },

  async execute(params: { inventoryItemId: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getInventoryLevels({ inventory_item_ids: [params.inventoryItemId] });
      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get inventory' };
    }
  },
};

export const updateInventoryTool: ShopifyTool = {
  name: 'inventory_update',
  description: 'Update inventory levels at a location. Use this to adjust stock quantities, correct inventory, or restock items.',
  category: 'inventory',
  requiresApproval: false,  // Agents can autonomously manage inventory
  inputSchema: {
    type: 'object',
    properties: {
      location_id: { type: 'string', description: 'The location ID' },
      inventory_item_id: { type: 'string', description: 'The inventory item ID' },
      available: { type: 'number', description: 'The new available quantity' },
    },
    required: ['location_id', 'inventory_item_id', 'available'],
  },

  async execute(params: { location_id: string; inventory_item_id: string; available: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.updateInventoryLevel(params);
      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update inventory' };
    }
  },
};

export const getLowStockTool: ShopifyTool = {
  name: 'inventory_low_stock',
  description: 'Find products with inventory below a threshold',
  category: 'inventory',
  inputSchema: {
    type: 'object',
    properties: {
      threshold: { type: 'number', description: 'Stock threshold (default 10)' },
      limit: { type: 'number', description: 'Max products to check (default 50)' },
    },
  },

  async execute(params: { threshold?: number; limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const threshold = params.threshold || 10;
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getProducts({ limit: params.limit || 50 });
      const products = response.products || [];
      const lowStockProducts = products.filter((product: any) => {
        return (product.variants || []).some((v: any) => (v.inventory_quantity || 0) < threshold && (v.inventory_quantity || 0) >= 0);
      }).map((product: any) => ({
        id: product.id,
        title: product.title,
        variants: product.variants.map((v: any) => ({
          id: v.id, title: v.title, inventory_quantity: v.inventory_quantity, inventory_item_id: v.inventory_item_id,
        })),
      }));
      return { success: true, data: { lowStockProducts, total: lowStockProducts.length, threshold } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get low stock products' };
    }
  },
};
