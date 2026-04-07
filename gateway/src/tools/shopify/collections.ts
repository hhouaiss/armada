import { ShopifyClient } from '../../lib/shopify-client.js';
import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';

export const getCollectionTool: ShopifyTool = {
  name: 'collection_get',
  description: 'Get details of a specific collection including title, description, and SEO metadata',
  category: 'collections',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      collectionId: { type: 'string', description: 'The collection ID' },
    },
    required: ['collectionId'],
  },

  validate(params: any) {
    if (!params.collectionId) return { valid: false, errors: ['Collection ID is required'] };
    return { valid: true };
  },

  async execute(params: { collectionId: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const collection = await client.getCollection(params.collectionId);
      return { success: true, data: collection };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get collection' };
    }
  },
};

export const listCollectionsTool: ShopifyTool = {
  name: 'collection_list',
  description: 'List all collections in the store. Use this to find collections that need SEO optimization.',
  category: 'collections',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of collections to return (default 50)' },
    },
  },

  async execute(params: { limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const collections = await client.getCollections();
      return { success: true, data: collections };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list collections' };
    }
  },
};

export const updateCollectionSEOTool: ShopifyTool = {
  name: 'collection_update_seo',
  description: 'Update collection SEO fields including title, description, meta title, and meta description. Use this to improve collection SEO and search rankings.',
  category: 'collections',
  requiresApproval: false,  // Agents can autonomously optimize SEO
  inputSchema: {
    type: 'object',
    properties: {
      collectionId: { type: 'string', description: 'The collection ID to update' },
      title: { type: 'string', description: 'Collection title (optional)' },
      bodyHtml: { type: 'string', description: 'Collection description in HTML (optional)' },
      metaTitle: { type: 'string', description: 'SEO meta title (max 70 chars recommended)' },
      metaDescription: { type: 'string', description: 'SEO meta description (max 160 chars recommended)' },
    },
    required: ['collectionId'],
  },

  validate(params: any) {
    if (!params.collectionId) return { valid: false, errors: ['Collection ID is required'] };
    if (!params.title && !params.bodyHtml && !params.metaTitle && !params.metaDescription) {
      return { valid: false, errors: ['At least one field to update is required'] };
    }
    if (params.metaTitle && params.metaTitle.length > 70) {
      return { valid: false, errors: ['Meta title should be 70 characters or less for best SEO'] };
    }
    if (params.metaDescription && params.metaDescription.length > 160) {
      return { valid: false, errors: ['Meta description should be 160 characters or less for best SEO'] };
    }
    return { valid: true };
  },

  async execute(params: {
    collectionId: string;
    title?: string;
    bodyHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
  }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);

      const updateData: any = {};
      if (params.title) updateData.title = params.title;
      if (params.bodyHtml) updateData.body_html = params.bodyHtml;

      // Shopify uses metafields for SEO data
      if (params.metaTitle || params.metaDescription) {
        updateData.metafields_global_title_tag = params.metaTitle;
        updateData.metafields_global_description_tag = params.metaDescription;
      }

      const result = await client.updateCollection(params.collectionId, updateData);
      return {
        success: true,
        data: result,
        message: 'Collection SEO updated successfully'
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update collection SEO' };
    }
  },
};
