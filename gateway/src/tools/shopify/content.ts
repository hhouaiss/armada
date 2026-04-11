import { ShopifyClient } from '../../lib/shopify-client.js';
import { ShopifyTool, ToolContext, ToolResult } from '../../types/operations.js';

export const listBlogsTool: ShopifyTool = {
  name: 'blog_list',
  description: 'List all blogs in the store. Use this to find where to publish articles.',
  category: 'content',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(params: {}, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const blogs = await client.getBlogs();
      return { success: true, data: blogs };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list blogs' };
    }
  },
};

export const createBlogTool: ShopifyTool = {
  name: 'blog_create',
  description: 'Create a new blog in the store. Use this if no suitable blog exists for publishing articles.',
  category: 'content',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Blog title (e.g., "News", "Tips & Tricks")' },
      handle: { type: 'string', description: 'URL-friendly handle (e.g., "news", "tips-and-tricks")' },
    },
    required: ['title'],
  },

  validate(params: any) {
    if (!params.title) return { valid: false, errors: ['Blog title is required'] };
    return { valid: true };
  },

  async execute(params: { title: string; handle?: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const result = await client.createBlog({
        title: params.title,
        handle: params.handle || params.title.toLowerCase().replace(/\s+/g, '-'),
      });
      return { success: true, data: result, message: `Blog "${params.title}" created successfully` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create blog' };
    }
  },
};

export const listArticlesTool: ShopifyTool = {
  name: 'article_list',
  description: 'List articles in a specific blog. Use this to see existing content.',
  category: 'content',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      blogId: { type: 'string', description: 'The blog ID to list articles from' },
      limit: { type: 'number', description: 'Maximum number of articles to return (default 20)' },
    },
    required: ['blogId'],
  },

  validate(params: any) {
    if (!params.blogId) return { valid: false, errors: ['Blog ID is required'] };
    return { valid: true };
  },

  async execute(params: { blogId: string; limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);
      const articles = await client.getArticles(params.blogId, { limit: params.limit || 20 });
      return { success: true, data: articles };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list articles' };
    }
  },
};

export const createArticleTool: ShopifyTool = {
  name: 'article_create',
  description: 'Create and publish a blog article with SEO-optimized content. Use this to write and publish blog posts, product guides, tutorials, etc.',
  category: 'content',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      blogId: { type: 'string', description: 'The blog ID to publish to' },
      title: { type: 'string', description: 'Article title (SEO-optimized, engaging)' },
      bodyHtml: { type: 'string', description: 'Article content in HTML format' },
      author: { type: 'string', description: 'Author name (optional, defaults to store name)' },
      tags: { type: 'string', description: 'Comma-separated tags for categorization' },
      metaDescription: { type: 'string', description: 'SEO meta description (max 160 chars)' },
      published: { type: 'boolean', description: 'Publish immediately (true) or save as draft (false)', default: true },
      image: {
        type: 'object',
        description: 'Featured image (optional)',
        properties: {
          src: { type: 'string', description: 'Image URL' },
          alt: { type: 'string', description: 'Image alt text for SEO' },
        },
      },
    },
    required: ['blogId', 'title', 'bodyHtml'],
  },

  validate(params: any) {
    if (!params.blogId) return { valid: false, errors: ['Blog ID is required'] };
    if (!params.title) return { valid: false, errors: ['Article title is required'] };
    if (!params.bodyHtml) return { valid: false, errors: ['Article content is required'] };
    if (params.metaDescription && params.metaDescription.length > 160) {
      return { valid: false, errors: ['Meta description should be 160 characters or less'] };
    }
    return { valid: true };
  },

  async execute(params: {
    blogId: string;
    title: string;
    bodyHtml: string;
    author?: string;
    tags?: string;
    metaDescription?: string;
    published?: boolean;
    image?: { src: string; alt: string };
  }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);

      const articleData: any = {
        title: params.title,
        body_html: params.bodyHtml,
        published: params.published !== false,
      };

      if (params.author) articleData.author = params.author;
      if (params.tags) articleData.tags = params.tags;
      if (params.metaDescription) articleData.metafields_global_description_tag = params.metaDescription;
      if (params.image) {
        articleData.image = {
          src: params.image.src,
          alt: params.image.alt || params.title,
        };
      }

      const result = await client.createArticle(params.blogId, articleData);
      return {
        success: true,
        data: result,
        message: `Article "${params.title}" ${params.published !== false ? 'published' : 'saved as draft'} successfully`
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create article' };
    }
  },
};

export const updateArticleTool: ShopifyTool = {
  name: 'article_update',
  description: 'Update an existing blog article. Use this to improve content, fix errors, or optimize SEO.',
  category: 'content',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      blogId: { type: 'string', description: 'The blog ID' },
      articleId: { type: 'string', description: 'The article ID to update' },
      title: { type: 'string', description: 'New article title (optional)' },
      bodyHtml: { type: 'string', description: 'New article content in HTML (optional)' },
      tags: { type: 'string', description: 'Updated tags (optional)' },
      metaDescription: { type: 'string', description: 'Updated meta description (optional)' },
    },
    required: ['blogId', 'articleId'],
  },

  validate(params: any) {
    if (!params.blogId) return { valid: false, errors: ['Blog ID is required'] };
    if (!params.articleId) return { valid: false, errors: ['Article ID is required'] };
    if (!params.title && !params.bodyHtml && !params.tags && !params.metaDescription) {
      return { valid: false, errors: ['At least one field to update is required'] };
    }
    return { valid: true };
  },

  async execute(params: {
    blogId: string;
    articleId: string;
    title?: string;
    bodyHtml?: string;
    tags?: string;
    metaDescription?: string;
  }, context: ToolContext): Promise<ToolResult> {
    try {
      const client = new ShopifyClient(context.shopifyDomain, context.shopifyAccessToken);

      const updateData: any = {};
      if (params.title) updateData.title = params.title;
      if (params.bodyHtml) updateData.body_html = params.bodyHtml;
      if (params.tags) updateData.tags = params.tags;
      if (params.metaDescription) updateData.metafields_global_description_tag = params.metaDescription;

      const result = await client.updateArticle(params.blogId, params.articleId, updateData);
      return { success: true, data: result, message: 'Article updated successfully' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update article' };
    }
  },
};
