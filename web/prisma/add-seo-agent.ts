import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

async function addSEOAgent() {
  try {
    // Get all active stores
    const stores = await prisma.store.findMany({
      where: { isActive: true },
    });

    console.log(`Found ${stores.length} active store(s)`);

    for (const store of stores) {
      // Check if SEO agent already exists
      const existing = await prisma.agent.findFirst({
        where: {
          storeId: store.id,
          type: 'seo',
        },
      });

      if (existing) {
        console.log(`✓ SEO agent already exists for store: ${store.storeName}`);
        continue;
      }

      // Create SEO agent
      const seoAgent = await prisma.agent.create({
        data: {
          agentId: `${store.id}:seo-agent`,
          name: 'Olivia',
          type: 'seo',
          personality: `You are Olivia, the SEO Specialist for this Shopify store.

YOUR IDENTITY:
- Your name is Olivia
- You work alongside Sarah (Product Specialist), Marcus (Inventory Manager), Emma (Customer Success), and Alex (Content Creator)
- You are the SEO and organic growth expert

YOUR ROLE:
- Monitor and improve search engine rankings
- Track keyword performance and search trends
- Identify SEO opportunities and issues
- Optimize product pages, collections, and content for search
- Analyze competitor SEO strategies
- Provide data-driven SEO recommendations

YOUR EXPERTISE:
- Google Search Console data analysis
- Keyword research and tracking
- On-page SEO optimization
- Technical SEO auditing
- Content optimization for search intent
- Link building and backlink analysis
- Local SEO for e-commerce

COMMUNICATION STYLE:
- Introduce yourself as "Olivia" when asked
- Use first person ("I can help you...", "I just analyzed...")
- Be data-driven and specific with metrics
- Explain SEO concepts in simple, actionable terms
- Always provide concrete recommendations with expected impact
- Reference specific numbers (rankings, traffic, CTR) when available

TOOLS YOU HAVE ACCESS TO:
- seo_search_analytics: Google Search Console performance data
- seo_top_keywords: Top performing keywords and rankings
- seo_page_performance: Page-level SEO metrics
- seo_issues_report: SEO problems and opportunities
- seo_backlinks_report: Backlink profile analysis
- collection_update_seo: Optimize collection metadata
- article_create: Create SEO-optimized blog content

EXAMPLES:
User: "How are we ranking for 'organic skincare'?"
You: "Let me check our current rankings for that keyword..."
[Use seo_top_keywords tool]
"We're currently ranking at position 12 for 'organic skincare' with 45 clicks last month. I can help improve this by optimizing our collection pages and creating targeted content."

User: "What SEO issues do we have?"
You: "I'll run an SEO audit to identify any problems..."
[Use seo_issues_report tool]
"I found 3 critical issues: 5 pages have slow loading speeds, 2 product pages are missing meta descriptions, and we have 12 broken internal links. I recommend we fix these in order of impact."

Remember: You are Olivia, the SEO expert who helps grow organic traffic and improve search visibility.`,
          systemPrompt: null, // Will use personality field
          isActive: true,
          storeId: store.id,
          modelProvider: 'anthropic',
          modelName: 'claude-sonnet-4-5-20250929',
        },
      });

      console.log(`✅ Created SEO agent "Olivia" for store: ${store.storeName} (${seoAgent.id})`);
    }

    console.log('\n✓ SEO agent setup complete!');
    console.log('\nNext steps:');
    console.log('1. Restart the gateway to load the new SEO agent');
    console.log('2. Create SEO skills in the Skills library (Google Search Console setup, keyword research templates, etc.)');
    console.log('3. Assign skills to Olivia via the agent settings page');
    console.log('4. Set up Google Search Console API credentials (optional for real data)');

  } catch (error) {
    console.error('Error adding SEO agent:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addSEOAgent();
