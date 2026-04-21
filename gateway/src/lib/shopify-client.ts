// @shopify/admin-api-client is the official lightweight GraphQL client used
// internally by @shopify/shopify-api — ideal for our use case (existing tokens,
// no OAuth flow needed). API version bumped to 2025-01.
import { createAdminApiClient, AdminApiClient } from '@shopify/admin-api-client';
import crypto from 'crypto';

const API_VERSION = '2026-01';

// ─── GID helpers ────────────────────────────────────────────────────────────

function toGid(resource: string, id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/${resource}/${id}`;
}

function fromGid(gid: string): string {
  if (!gid) return gid;
  return gid.split('/').pop() || gid;
}

// ─── Response flatteners (GraphQL → REST-compatible shapes) ─────────────────

function edges<T>(connection: { edges: Array<{ node: T }> }): T[] {
  return connection.edges.map((e) => e.node);
}

function flattenVariant(v: any) {
  return {
    id: fromGid(v.id),
    title: v.title,
    price: v.price,
    inventory_quantity: v.inventoryQuantity ?? 0,
    inventory_item_id: v.inventoryItem ? fromGid(v.inventoryItem.id) : undefined,
    _inventoryItemGid: v.inventoryItem?.id,
  };
}

function flattenProduct(p: any) {
  if (!p) return p;
  return {
    id: fromGid(p.id),
    title: p.title,
    body_html: p.bodyHtml,
    vendor: p.vendor,
    status: p.status?.toLowerCase(),
    variants: p.variants ? edges(p.variants).map(flattenVariant) : [],
  };
}

function flattenOrder(o: any) {
  if (!o) return o;
  return {
    id: fromGid(o.id),
    name: o.name,
    email: o.email,
    financial_status: o.displayFinancialStatus?.toLowerCase(),
    fulfillment_status: o.displayFulfillmentStatus?.toLowerCase() ?? null,
    total_price: o.totalPriceSet?.shopMoney?.amount,
    currency: o.totalPriceSet?.shopMoney?.currencyCode,
    created_at: o.createdAt,
    customer: o.customer
      ? {
          id: fromGid(o.customer.id),
          first_name: o.customer.firstName,
          last_name: o.customer.lastName,
          email: o.customer.email,
        }
      : null,
    line_items: o.lineItems
      ? edges(o.lineItems).map((li: any) => ({
          id: fromGid(li.id),
          title: li.title,
          quantity: li.quantity,
          price: li.originalUnitPriceSet?.shopMoney?.amount,
        }))
      : [],
  };
}

function flattenCustomer(c: any) {
  if (!c) return c;
  return {
    id: fromGid(c.id),
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email,
    phone: c.phone,
    tags: Array.isArray(c.tags) ? c.tags.join(', ') : c.tags,
    orders_count: c.numberOfOrders,
    total_spent: c.amountSpent?.amount,
  };
}

function flattenCollection(c: any) {
  if (!c) return c;
  return {
    id: fromGid(c.id),
    title: c.title,
    handle: c.handle,
    body_html: c.descriptionHtml,
    metafields_global_title_tag: c.seo?.title,
    metafields_global_description_tag: c.seo?.description,
  };
}

function flattenBlog(b: any) {
  if (!b) return b;
  return {
    id: fromGid(b.id),
    title: b.title,
    handle: b.handle,
  };
}

function flattenArticle(a: any) {
  if (!a) return a;
  return {
    id: fromGid(a.id),
    title: a.title,
    body_html: a.body,        // Article type uses "body" not "contentHtml"
    author: a.author?.name,
    tags: Array.isArray(a.tags) ? a.tags.join(', ') : a.tags,
    published_at: a.publishedAt,
    is_published: a.isPublished,
  };
}

function throwUserErrors(errors: Array<{ field: string[]; message: string }>) {
  if (errors && errors.length > 0) {
    throw new Error(errors.map((e) => `${(e.field ?? []).join('.')}: ${e.message}`).join(', '));
  }
}

// ─── ShopifyClient ───────────────────────────────────────────────────────────

export class ShopifyClient {
  private gql: AdminApiClient;

  constructor(domain: string, accessToken: string) {
    this.gql = createAdminApiClient({
      storeDomain: domain,
      apiVersion: API_VERSION,
      accessToken,
    });
  }

  private async query<T = any>(
    document: string,
    variables?: Record<string, any>
  ): Promise<T> {
    const response = await this.gql.request(document, { variables });
    if (response.errors) {
      const msg =
        response.errors.message ?? JSON.stringify(response.errors.graphQLErrors ?? response.errors);
      throw new Error(`Shopify GraphQL error: ${msg}`);
    }
    return response.data as T;
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async getProducts(params?: { limit?: number }) {
    const data = await this.query(
      `query GetProducts($first: Int!) {
        products(first: $first) {
          edges { node {
            id title bodyHtml vendor status
            variants(first: 10) {
              edges { node { id title price inventoryQuantity inventoryItem { id } } }
            }
          }}
        }
      }`,
      { first: params?.limit ?? 20 }
    );
    return { products: edges(data.products).map(flattenProduct) };
  }

  async getProduct(productId: string) {
    const data = await this.query(
      `query GetProduct($id: ID!) {
        product(id: $id) {
          id title bodyHtml vendor status
          variants(first: 10) {
            edges { node { id title price inventoryQuantity inventoryItem { id } } }
          }
        }
      }`,
      { id: toGid('Product', productId) }
    );
    return { product: flattenProduct(data.product) };
  }

  async createProduct(product: any) {
    const data = await this.query(
      `mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id title bodyHtml vendor status
            variants(first: 10) {
              edges { node { id title price inventoryQuantity inventoryItem { id } } }
            }
          }
          userErrors { field message }
        }
      }`,
      {
        input: {
          title: product.title,
          bodyHtml: product.body_html ?? '',
          vendor: product.vendor ?? '',
          productType: product.product_type ?? '',
          variants: product.variants?.map((v: any) => ({
            price: v.price,
            inventoryManagement: 'SHOPIFY',
          })),
        },
      }
    );
    throwUserErrors(data.productCreate.userErrors);
    return { product: flattenProduct(data.productCreate.product) };
  }

  async updateProduct(productId: string, product: any) {
    const input: any = { id: toGid('Product', productId) };
    if (product.title) input.title = product.title;
    if (product.body_html) input.bodyHtml = product.body_html;
    if (product.vendor) input.vendor = product.vendor;
    if (product.status) input.status = product.status.toUpperCase();

    const data = await this.query(
      `mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id title bodyHtml vendor status
            variants(first: 10) {
              edges { node { id title price inventoryQuantity inventoryItem { id } } }
            }
          }
          userErrors { field message }
        }
      }`,
      { input }
    );
    throwUserErrors(data.productUpdate.userErrors);
    return { product: flattenProduct(data.productUpdate.product) };
  }

  async deleteProduct(productId: string) {
    const data = await this.query(
      `mutation DeleteProduct($id: ID!) {
        productDelete(input: { id: $id }) {
          deletedProductId
          userErrors { field message }
        }
      }`,
      { id: toGid('Product', productId) }
    );
    throwUserErrors(data.productDelete.userErrors);
    return { deleted: true, id: productId };
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async getInventoryLevels(params?: { location_ids?: string[]; inventory_item_ids?: string[] }) {
    const ids = (params?.inventory_item_ids ?? []).map((id) => toGid('InventoryItem', id));
    if (ids.length === 0) return { inventory_levels: [] };

    const data = await this.query(
      `query GetInventoryLevels($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on InventoryItem {
            id
            inventoryLevels(first: 10) {
              edges { node {
                id
                location { id name }
                quantities(names: ["available"]) { name quantity }
              }}
            }
          }
        }
      }`,
      { ids }
    );

    const levels = (data.nodes ?? []).flatMap((node: any) =>
      edges(node.inventoryLevels ?? { edges: [] }).map((level: any) => ({
        inventory_item_id: fromGid(node.id),
        location_id: fromGid(level.location.id),
        location_name: level.location.name,
        available: level.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0,
      }))
    );
    return { inventory_levels: levels };
  }

  async updateInventoryLevel(params: {
    location_id: string;
    inventory_item_id: string;
    available: number;
  }) {
    const data = await this.query(
      `mutation SetInventory($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          inventoryAdjustmentGroup {
            changes { name delta quantityAfterChange }
          }
          userErrors { field message }
        }
      }`,
      {
        input: {
          reason: 'correction',
          setQuantities: [
            {
              inventoryItemId: toGid('InventoryItem', params.inventory_item_id),
              locationId: toGid('Location', params.location_id),
              quantity: params.available,
            },
          ],
        },
      }
    );
    throwUserErrors(data.inventorySetOnHandQuantities.userErrors);
    return {
      inventory_level: {
        inventory_item_id: params.inventory_item_id,
        location_id: params.location_id,
        available: params.available,
      },
    };
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrders(params?: { limit?: number; status?: string; financial_status?: string; fulfillment_status?: string }) {
    const queryParts: string[] = [];
    if (params?.status && params.status !== 'any') queryParts.push(`status:${params.status}`);
    if (params?.financial_status) queryParts.push(`financial_status:${params.financial_status}`);
    if (params?.fulfillment_status) queryParts.push(`fulfillment_status:${params.fulfillment_status}`);

    const data = await this.query(
      `query GetOrders($first: Int!, $query: String) {
        orders(first: $first, query: $query) {
          edges { node {
            id name email createdAt
            displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { id firstName lastName email }
            lineItems(first: 10) {
              edges { node {
                id title quantity
                originalUnitPriceSet { shopMoney { amount } }
              }}
            }
          }}
        }
      }`,
      {
        first: params?.limit ?? 20,
        query: queryParts.length ? queryParts.join(' ') : null,
      }
    );
    return { orders: edges(data.orders).map(flattenOrder) };
  }

  async getOrder(orderId: string) {
    const data = await this.query(
      `query GetOrder($id: ID!) {
        order(id: $id) {
          id name email createdAt
          displayFinancialStatus displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          customer { id firstName lastName email }
          lineItems(first: 20) {
            edges { node {
              id title quantity
              originalUnitPriceSet { shopMoney { amount } }
            }}
          }
        }
      }`,
      { id: toGid('Order', orderId) }
    );
    return flattenOrder(data.order);
  }

  async listOrders(params?: { status?: string; limit?: number; since_id?: string; fulfillment_status?: string }) {
    return this.getOrders(params);
  }

  async fulfillOrder(orderId: string, fulfillment: any) {
    // Step 1: get open fulfillment orders
    const foData = await this.query(
      `query GetFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 5) {
            edges { node { id status } }
          }
        }
      }`,
      { id: toGid('Order', orderId) }
    );

    const openFOs = edges(foData.order.fulfillmentOrders).filter(
      (fo: any) => fo.status === 'OPEN'
    );
    if (openFOs.length === 0) throw new Error('No open fulfillment orders found for this order');

    // Step 2: create fulfillment
    const data = await this.query(
      `mutation FulfillOrder($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }`,
      {
        fulfillment: {
          lineItemsByFulfillmentOrder: openFOs.map((fo: any) => ({
            fulfillmentOrderId: fo.id,
          })),
          ...(fulfillment.tracking_info && {
            trackingInfo: {
              number: fulfillment.tracking_info.number,
              company: fulfillment.tracking_info.company,
              url: fulfillment.tracking_info.url,
            },
          }),
          notifyCustomer: fulfillment.notify_customer !== false,
        },
      }
    );
    throwUserErrors(data.fulfillmentCreate.userErrors);
    return { fulfillment: data.fulfillmentCreate.fulfillment };
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async getCustomers(params?: { limit?: number; query?: string }) {
    const data = await this.query(
      `query GetCustomers($first: Int!, $query: String) {
        customers(first: $first, query: $query) {
          edges { node {
            id firstName lastName email phone tags
            numberOfOrders
            amountSpent { amount currencyCode }
          }}
        }
      }`,
      { first: params?.limit ?? 20, query: params?.query ?? null }
    );
    const customers = edges(data.customers).map(flattenCustomer);
    return { customers, total: customers.length };
  }

  async getCustomer(customerId: string) {
    const data = await this.query(
      `query GetCustomer($id: ID!) {
        customer(id: $id) {
          id firstName lastName email phone tags
          numberOfOrders
          amountSpent { amount currencyCode }
        }
      }`,
      { id: toGid('Customer', customerId) }
    );
    return { customer: flattenCustomer(data.customer) };
  }

  async updateCustomer(customerId: string, customer: any) {
    const input: any = { id: toGid('Customer', customerId) };
    if (customer.tags !== undefined)
      input.tags = customer.tags.split(',').map((t: string) => t.trim());
    if (customer.first_name) input.firstName = customer.first_name;
    if (customer.last_name) input.lastName = customer.last_name;
    if (customer.email) input.email = customer.email;
    if (customer.phone) input.phone = customer.phone;

    const data = await this.query(
      `mutation UpdateCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id firstName lastName email phone tags }
          userErrors { field message }
        }
      }`,
      { input }
    );
    throwUserErrors(data.customerUpdate.userErrors);
    return { customer: flattenCustomer(data.customerUpdate.customer) };
  }

  // ── Collections ────────────────────────────────────────────────────────────

  async getCollections() {
    const data = await this.query(
      `query GetCollections($first: Int!) {
        collections(first: $first) {
          edges { node {
            id title handle descriptionHtml
            seo { title description }
          }}
        }
      }`,
      { first: 50 }
    );
    return { custom_collections: edges(data.collections).map(flattenCollection) };
  }

  async getCollection(collectionId: string) {
    const data = await this.query(
      `query GetCollection($id: ID!) {
        collection(id: $id) {
          id title handle descriptionHtml
          seo { title description }
        }
      }`,
      { id: toGid('Collection', collectionId) }
    );
    return { custom_collection: flattenCollection(data.collection) };
  }

  async createCollection(collection: any) {
    const input: any = {
      title: collection.title,
      ...(collection.handle && { handle: collection.handle }),
      ...(collection.body_html && { descriptionHtml: collection.body_html }),
      ...((collection.metafields_global_title_tag || collection.metafields_global_description_tag) && {
        seo: {
          title: collection.metafields_global_title_tag ?? '',
          description: collection.metafields_global_description_tag ?? '',
        },
      }),
    };

    const data = await this.query(
      `mutation CreateCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id title handle descriptionHtml
            seo { title description }
          }
          userErrors { field message }
        }
      }`,
      { input }
    );
    throwUserErrors(data.collectionCreate.userErrors);
    return { custom_collection: flattenCollection(data.collectionCreate.collection) };
  }

  async updateCollection(collectionId: string, collection: any) {
    const input: any = { id: toGid('Collection', collectionId) };
    if (collection.title) input.title = collection.title;
    if (collection.body_html) input.descriptionHtml = collection.body_html;
    if (collection.handle) input.handle = collection.handle;
    if (collection.metafields_global_title_tag || collection.metafields_global_description_tag) {
      input.seo = {
        title: collection.metafields_global_title_tag ?? '',
        description: collection.metafields_global_description_tag ?? '',
      };
    }

    const data = await this.query(
      `mutation UpdateCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection {
            id title handle descriptionHtml
            seo { title description }
          }
          userErrors { field message }
        }
      }`,
      { input }
    );
    throwUserErrors(data.collectionUpdate.userErrors);
    return { custom_collection: flattenCollection(data.collectionUpdate.collection) };
  }

  // ── Blogs & Articles ───────────────────────────────────────────────────────

  async getBlogs() {
    const data = await this.query(
      `query GetBlogs {
        blogs(first: 50) {
          edges { node { id title handle } }
        }
      }`
    );
    return { blogs: edges(data.blogs).map(flattenBlog) };
  }

  async getBlog(blogId: string) {
    const data = await this.query(
      `query GetBlog($id: ID!) {
        blog(id: $id) { id title handle }
      }`,
      { id: toGid('Blog', blogId) }
    );
    return { blog: flattenBlog(data.blog) };
  }

  async createBlog(blog: any) {
    const data = await this.query(
      `mutation CreateBlog($blog: BlogCreateInput!) {
        blogCreate(blog: $blog) {
          blog { id title handle }
          userErrors { field message }
        }
      }`,
      { blog: { title: blog.title, ...(blog.handle && { handle: blog.handle }) } }
    );
    throwUserErrors(data.blogCreate.userErrors);
    return { blog: flattenBlog(data.blogCreate.blog) };
  }

  async getArticles(blogId: string, params?: { limit?: number }) {
    const data = await this.query(
      `query GetArticles($blogId: ID!, $first: Int!) {
        blog(id: $blogId) {
          articles(first: $first) {
            edges { node {
              id title body isPublished publishedAt
              author { name }
              tags
            }}
          }
        }
      }`,
      { blogId: toGid('Blog', blogId), first: params?.limit ?? 20 }
    );
    return { articles: edges(data.blog.articles).map(flattenArticle) };
  }

  async createArticle(blogId: string, article: any) {
    // author is required (AuthorInput!) — fallback to "Author" if not provided
    const input: any = {
      blogId: toGid('Blog', blogId),
      title: article.title,
      body: article.body_html ?? '',           // input field is "body", not "contentHtml"
      isPublished: article.published !== false,
      author: { name: article.author ?? 'Author' },
    };
    if (article.tags) input.tags = article.tags.split(',').map((t: string) => t.trim());
    if (article.image) input.image = { url: article.image.src, altText: article.image.alt ?? article.title };
    // SEO fields map to metafields in GraphQL (no seo input on ArticleCreateInput)
    if (article.metafields_global_title_tag || article.metafields_global_description_tag) {
      input.metafields = [
        ...(article.metafields_global_title_tag ? [{
          namespace: 'global', key: 'title_tag',
          value: article.metafields_global_title_tag, type: 'single_line_text_field',
        }] : []),
        ...(article.metafields_global_description_tag ? [{
          namespace: 'global', key: 'description_tag',
          value: article.metafields_global_description_tag, type: 'single_line_text_field',
        }] : []),
      ];
    }

    const data = await this.query(
      `mutation CreateArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article {
            id title body isPublished publishedAt
            author { name }
            tags
          }
          userErrors { field message }
        }
      }`,
      { article: input }
    );
    throwUserErrors(data.articleCreate.userErrors);
    return { article: flattenArticle(data.articleCreate.article) };
  }

  async updateArticle(_blogId: string, articleId: string, article: any) {
    const input: any = {};
    if (article.title) input.title = article.title;
    if (article.body_html) input.body = article.body_html;  // input field is "body", not "contentHtml"
    if (article.tags) input.tags = article.tags.split(',').map((t: string) => t.trim());
    if (article.metafields_global_title_tag || article.metafields_global_description_tag) {
      input.metafields = [
        ...(article.metafields_global_title_tag ? [{
          namespace: 'global', key: 'title_tag',
          value: article.metafields_global_title_tag, type: 'single_line_text_field',
        }] : []),
        ...(article.metafields_global_description_tag ? [{
          namespace: 'global', key: 'description_tag',
          value: article.metafields_global_description_tag, type: 'single_line_text_field',
        }] : []),
      ];
    }

    const data = await this.query(
      `mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article {
            id title body isPublished publishedAt
            author { name }
            tags
          }
          userErrors { field message }
        }
      }`,
      { id: toGid('Article', articleId), article: input }
    );
    throwUserErrors(data.articleUpdate.userErrors);
    return { article: flattenArticle(data.articleUpdate.article) };
  }

  // ── Shop ───────────────────────────────────────────────────────────────────

  async getShopInfo() {
    const data = await this.query(
      `query GetShop {
        shop {
          name myshopifyDomain
          primaryDomain { host }
          email description
          currencyCode timezoneAbbreviation
          countryCode primaryLocale
          billingAddress { address1 city province phone }
        }
      }`
    );
    const s = data.shop;
    return {
      shop: {
        name: s.name,
        domain: s.primaryDomain?.host,
        myshopify_domain: s.myshopifyDomain,
        email: s.email,
        description: s.description,
        currency: s.currencyCode,
        timezone: s.timezoneAbbreviation,
        country_name: s.countryCode,
        primary_locale: s.primaryLocale,
        address1: s.billingAddress?.address1,
        city: s.billingAddress?.city,
        province: s.billingAddress?.province,
        phone: s.billingAddress?.phone,
        money_format: `{{amount}} ${s.currencyCode}`,
      },
    };
  }
}

// ─── Token decryption (unchanged) ────────────────────────────────────────────

export function decryptToken(encryptedToken: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
