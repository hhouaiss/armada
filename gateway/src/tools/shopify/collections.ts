import { ShopifyClient } from '../../lib/shopify-client.js';
import { fuzzyRank } from '../../lib/fuzzy.js';
import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';

/**
 * Resolve a collection reference — an ID, a handle, or a name as a human would
 * say it — to matching collections. Shared by collection_search and the
 * name-based path of collection_get.
 */
async function findCollections(client: ShopifyClient, term: string, limit: number) {
  const escaped = term.replace(/["\\]/g, '\\$&');
  for (const q of [`title:*${escaped}*`, `handle:*${escaped}*`, escaped]) {
    const { custom_collections } = await client.searchCollections(q, limit);
    if (custom_collections.length > 0) {
      return { collections: custom_collections, matchType: 'shopify' as const };
    }
  }

  // Fuzzy fallback over the whole catalog: handles accents, word order,
  // partial words and typos that Shopify's own search misses.
  const { custom_collections: all } = await client.getCollections();
  const matches = fuzzyRank(term, all, (c: any) => [c.title, c.handle], { limit });
  return { collections: matches, matchType: 'fuzzy' as const };
}

export const getCollectionTool: ShopifyTool = {
  name: 'collection_get',
  description:
    'Get details of a specific collection including title, description, product count and SEO metadata. ' +
    'Accepts either a collection ID or the collection name as the user said it.',
  category: 'collections',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      collectionId: { type: 'string', description: 'The collection ID (if known)' },
      name: { type: 'string', description: 'The collection name or part of it, if you do not have the ID' },
    },
  },

  validate(params: any) {
    if (!params.collectionId && !params.name) {
      return { valid: false, errors: ['Either a collection ID or a collection name is required'] };
    }
    return { valid: true };
  },

  async execute(params: { collectionId?: string; name?: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);

      let id = params.collectionId;
      if (!id && params.name) {
        const { collections } = await findCollections(client, params.name, 5);
        if (collections.length === 0) {
          return {
            success: true,
            data: {
              collection: null,
              hint: `Aucune collection trouvée pour "${params.name}". Utilise collection_list pour voir toutes les collections.`,
            },
          };
        }
        if (collections.length > 1) {
          return {
            success: true,
            data: {
              candidates: collections,
              hint: `Plusieurs collections correspondent à "${params.name}". Demande laquelle, ou rappelle collection_get avec l'ID choisi.`,
            },
          };
        }
        id = collections[0].id;
      }

      const collection = await client.getCollection(id!);
      return { success: true, data: collection };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get collection' };
    }
  },
};

export const searchCollectionsTool: ShopifyTool = {
  name: 'collection_search',
  description:
    'Find collections by name (full or partial, typos and accents tolerated). ' +
    'ALWAYS use this first when the user mentions a collection by its name — ' +
    'never ask the user for a collection ID or handle. Returns matching collections ' +
    'with their IDs so you can then call collection_get / collection_update_seo.',
  category: 'collections',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The collection name or part of it, as the user said it' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    required: ['name'],
  },

  validate(params: any) {
    if (!params.name) return { valid: false, errors: ['A collection name is required'] };
    return { valid: true };
  },

  async execute(params: { name: string; limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const limit = params.limit ?? 10;
      const term = params.name.trim();
      const { collections, matchType } = await findCollections(client, term, limit);

      if (collections.length === 0) {
        return {
          success: true,
          data: {
            collections: [],
            total: 0,
            hint: `Aucune collection trouvée pour "${term}". Utilise collection_list pour voir toutes les collections du catalogue.`,
          },
        };
      }

      return { success: true, data: { collections, total: collections.length, matchType } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to search collections' };
    }
  },
};

export const listCollectionsTool: ShopifyTool = {
  name: 'collection_list',
  description:
    'List all collections in the store with their IDs, handles and product counts. ' +
    'Use this to get the full catalog overview, or when collection_search finds nothing.',
  category: 'collections',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of collections to return (default 250)' },
    },
  },

  async execute(params: { limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const { custom_collections } = await client.getCollections(params.limit ?? 250);
      return { success: true, data: { collections: custom_collections, total: custom_collections.length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list collections' };
    }
  },
};

export const updateCollectionSEOTool: ShopifyTool = {
  name: 'collection_update_seo',
  description:
    'Update collection SEO fields including title, description, meta title, and meta description. ' +
    'Use this to improve collection SEO and search rankings. ' +
    'If you only have the collection name, use collection_search first to find its ID.',
  category: 'collections',
  requiresApproval: true,
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
