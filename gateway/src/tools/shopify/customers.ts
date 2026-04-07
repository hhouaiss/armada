import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';
import { ShopifyClient } from '../../lib/shopify-client.js';

export const getCustomerTool: ShopifyTool = {
  name: 'customer_get',
  description: 'Get customer details by ID',
  category: 'customers',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: 'The Shopify customer ID' },
    },
    required: ['customerId'],
  },

  async execute(params: { customerId: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getCustomer(params.customerId);
      return { success: true, data: response.customer };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get customer' };
    }
  },
};

export const listCustomersTool: ShopifyTool = {
  name: 'customer_list',
  description: 'List customers with optional limit',
  category: 'customers',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of customers to return (default 20)' },
    },
  },

  async execute(params: { limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getCustomers({ limit: params.limit || 20 });
      return { success: true, data: { customers: response.customers, total: response.customers.length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list customers' };
    }
  },
};

export const updateCustomerTagsTool: ShopifyTool = {
  name: 'customer_update_tags',
  description: 'Update customer tags for segmentation and organization. Use this to categorize customers (VIP, wholesale, etc.).',
  category: 'customers',
  requiresApproval: false,  // Agents can autonomously manage tags
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: 'The customer ID' },
      tags: { type: 'string', description: 'Comma-separated list of tags' },
    },
    required: ['customerId', 'tags'],
  },

  async execute(params: { customerId: string; tags: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.updateCustomer(params.customerId, { tags: params.tags });
      return { success: true, data: response.customer };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update customer tags' };
    }
  },
};
