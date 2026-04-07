import { ShopifyClient } from '../../lib/shopify-client.js';
import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';

export const getOrderTool: ShopifyTool = {
  name: 'order_get',
  description: 'Get details of a specific order by ID. Use this to check order status, items, customer info, etc.',
  category: 'orders',
  requiresApproval: false,  // Read-only, safe
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order ID' },
    },
    required: ['orderId'],
  },

  validate(params: any) {
    if (!params.orderId) return { valid: false, errors: ['Order ID is required'] };
    return { valid: true };
  },

  async execute(params: { orderId: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const order = await client.getOrder(params.orderId);
      return { success: true, data: order };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get order' };
    }
  },
};

export const listOrdersTool: ShopifyTool = {
  name: 'order_list',
  description: 'List recent orders with optional filtering by status (open, closed, cancelled, any). Default limit is 20.',
  category: 'orders',
  requiresApproval: false,  // Read-only, safe
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Order status filter: open, closed, cancelled, or any',
        enum: ['open', 'closed', 'cancelled', 'any']
      },
      limit: { type: 'number', description: 'Number of orders to return (max 250)', default: 20 },
    },
  },

  validate(params: any) {
    if (params.limit && (params.limit < 1 || params.limit > 250)) {
      return { valid: false, errors: ['Limit must be between 1 and 250'] };
    }
    return { valid: true };
  },

  async execute(params: { status?: string; limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const orders = await client.listOrders({
        status: params.status || 'any',
        limit: params.limit || 20,
      });
      return { success: true, data: orders };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list orders' };
    }
  },
};

// Refund and cancellation tools removed - users prefer to handle financial operations directly in Shopify dashboard
