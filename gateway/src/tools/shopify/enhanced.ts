/**
 * Enhanced Shopify Tools
 *
 * Fills critical gaps: find products by URL/handle, update metafields,
 * create URL redirects, inspect navigation menus, build storefront URLs.
 */

import { AgentTool, ToolContext, ToolResult } from '../../types/operations.js';
import { ShopifyClient } from '../../lib/shopify-client.js';

// ── product_get_by_handle ────────────────────────────────────────────────────

export const getProductByHandleTool: AgentTool = {
  name: 'product_get_by_handle',
  description:
    'Find a product by its URL handle or slug (e.g., "mon-super-produit" from the URL /products/mon-super-produit). ' +
    'Use this when you have the product URL or handle but not the ID. ' +
    'Returns product details including the full storefront URL.',
  category: 'products',
  inputSchema: {
    type: 'object',
    properties: {
      handle: {
        type: 'string',
        description:
          'The product handle/slug from the URL (e.g., "mon-produit" from https://store.myshopify.com/products/mon-produit). ' +
          'Do NOT include /products/ — just the slug.',
      },
    },
    required: ['handle'],
  },

  async execute(params: { handle: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      // Clean the handle in case the agent passes a full URL
      const handle = params.handle
        .replace(/^https?:\/\/[^/]+/, '')
        .replace('/products/', '')
        .split('?')[0]
        .trim()
        .toLowerCase();

      const response = await client.getProductByHandle(handle);

      if (!response.product) {
        return {
          success: false,
          error: `Produit introuvable pour le handle: "${handle}". Vérifiez l'URL.`,
        };
      }

      // Enrich with storefront URL
      const storefrontUrl = `https://${context.shopifyDomain}/products/${handle}`;
      return {
        success: true,
        data: {
          ...response.product,
          storefront_url: response.product.online_store_url ?? storefrontUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get product by handle',
      };
    }
  },
};

// ── product_update_metafields ────────────────────────────────────────────────

export const updateProductMetafieldsTool: AgentTool = {
  name: 'product_update_metafields',
  description:
    'Update or create metafields on a Shopify product. ' +
    'Use for: SEO metadata (title_tag, description_tag), custom fields, review scores, etc. ' +
    'Common namespaces: "global" (for SEO), "custom" (for custom data).',
  category: 'products',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      productId: {
        type: 'string',
        description: 'The Shopify product ID',
      },
      metafields: {
        type: 'object',
        description: 'Array of metafields to set',
        properties: {
          namespace: { type: 'string', description: 'Metafield namespace (e.g., "global", "custom")' },
          key: { type: 'string', description: 'Metafield key (e.g., "title_tag", "description_tag")' },
          value: { type: 'string', description: 'Metafield value' },
          type: { type: 'string', description: 'Value type (default: "single_line_text_field")' },
        },
      },
    },
    required: ['productId', 'metafields'],
  },

  async execute(
    params: {
      productId: string;
      metafields: Array<{ namespace: string; key: string; value: string; type?: string }>;
    },
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const metafields = (Array.isArray(params.metafields) ? params.metafields : [params.metafields]).map((m) => ({
        namespace: m.namespace || 'custom',
        key: m.key,
        value: m.value,
        type: m.type || 'single_line_text_field',
      }));

      const response = await client.setProductMetafields(params.productId, metafields);
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update metafields',
      };
    }
  },
};

// ── redirect_create ──────────────────────────────────────────────────────────

export const createRedirectTool: AgentTool = {
  name: 'redirect_create',
  description:
    'Create a URL redirect in Shopify. ' +
    'Use to fix broken links, handle renamed products, manage seasonal URLs, or SEO migrations. ' +
    'Example: redirect /old-product to /products/new-product.',
  category: 'products',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The old/source URL path (e.g., "/old-page" or "/products/old-product")',
      },
      target: {
        type: 'string',
        description: 'The destination URL path (e.g., "/products/new-product" or a full URL)',
      },
    },
    required: ['path', 'target'],
  },

  async execute(params: { path: string; target: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      // Ensure paths start with /
      const path = params.path.startsWith('/') ? params.path : `/${params.path}`;
      const target = params.target.startsWith('/') || params.target.startsWith('http')
        ? params.target
        : `/${params.target}`;

      const response = await client.createRedirect(path, target);
      return {
        success: true,
        data: {
          ...response.redirect,
          storefront_url: `https://${context.shopifyDomain}${path}`,
          message: `Redirection créée: ${path} → ${target}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create redirect',
      };
    }
  },
};

// ── storefront_url ───────────────────────────────────────────────────────────

export const storefrontUrlTool: AgentTool = {
  name: 'storefront_url',
  description:
    'Build the public storefront URL for a product, collection, page, or blog post. ' +
    'Use this to get the direct customer-facing link for any store resource.',
  category: 'store',
  inputSchema: {
    type: 'object',
    properties: {
      resourceType: {
        type: 'string',
        description: 'Type of resource',
        enum: ['product', 'collection', 'page', 'blog', 'article'],
      },
      handle: {
        type: 'string',
        description: 'The resource handle/slug',
      },
      blogHandle: {
        type: 'string',
        description: 'Blog handle (required for article type only)',
      },
    },
    required: ['resourceType', 'handle'],
  },

  async execute(
    params: { resourceType: string; handle: string; blogHandle?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const base = `https://${context.shopifyDomain}`;
    let url: string;

    switch (params.resourceType) {
      case 'product':
        url = `${base}/products/${params.handle}`;
        break;
      case 'collection':
        url = `${base}/collections/${params.handle}`;
        break;
      case 'page':
        url = `${base}/pages/${params.handle}`;
        break;
      case 'blog':
        url = `${base}/blogs/${params.handle}`;
        break;
      case 'article':
        if (!params.blogHandle) {
          return { success: false, error: 'blogHandle is required for article URLs' };
        }
        url = `${base}/blogs/${params.blogHandle}/${params.handle}`;
        break;
      default:
        url = `${base}/${params.handle}`;
    }

    return {
      success: true,
      data: { url, resourceType: params.resourceType, handle: params.handle },
    };
  },
};

// ── navigation_get ───────────────────────────────────────────────────────────

export const getNavigationTool: AgentTool = {
  name: 'navigation_get',
  description:
    'Get the store navigation menus (header, footer). ' +
    'Use to inspect current navigation links, find broken or missing links, ' +
    'or understand the store structure before making changes.',
  category: 'store',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, never>, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const response = await client.getMenus();
      return {
        success: true,
        data: {
          menus: response.menus,
          count: response.menus.length,
          message: `${response.menus.length} menu(s) trouvé(s). Utilisez web_browse pour vérifier les liens visuellement.`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get navigation menus',
      };
    }
  },
};
