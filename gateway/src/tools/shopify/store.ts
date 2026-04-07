import { ShopifyClient } from '../../lib/shopify-client.js';
import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';

export const getStoreInfoTool: ShopifyTool = {
  name: 'store_get_info',
  description: 'Get store information including name, domain, email, description, currency, timezone, and business details. Use this to understand store context when creating content or optimizing SEO.',
  category: 'store',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(params: {}, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const shopInfo = await client.getShopInfo();

      // Extract useful information for agents
      const relevantInfo = {
        name: shopInfo.shop?.name,
        domain: shopInfo.shop?.domain,
        email: shopInfo.shop?.email,
        description: shopInfo.shop?.description,
        currency: shopInfo.shop?.currency,
        timezone: shopInfo.shop?.timezone,
        country: shopInfo.shop?.country_name,
        address: shopInfo.shop?.address1,
        city: shopInfo.shop?.city,
        province: shopInfo.shop?.province,
        phone: shopInfo.shop?.phone,
        primaryLocale: shopInfo.shop?.primary_locale,
        moneyFormat: shopInfo.shop?.money_format,
      };

      return {
        success: true,
        data: relevantInfo,
        message: 'Store information retrieved successfully'
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get store info' };
    }
  },
};
