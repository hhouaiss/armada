/**
 * Catalogue d'apps connectables via MCP — façon "je choisis une app, elle se
 * connecte via MCP, c'est tout".
 *
 * Chaque entrée décrit un serveur MCP préconfiguré (endpoint HTTP distant ou
 * commande stdio). L'utilisateur ne fournit que les secrets (clé API, token…) ;
 * le reste de la config est injecté automatiquement. La connexion crée une
 * Integration `mcp:<slug>` que le gateway monte au démarrage (mcp-bridge).
 *
 * Deux exceptions ne passent PAS par MCP :
 *  - Shopify : connecté via l'API Shopify depuis la page Boutiques (intact).
 *  - Telegram : canal de notification du gateway, simple token de bot.
 */

export interface McpSecretField {
  /** Clé sous laquelle la valeur est injectée (voir `inject`) */
  key: string;
  label: string;
  placeholder: string;
  /** Où injecter la valeur dans la config MCP */
  inject: 'bearer' | 'header' | 'env';
  /** Nom du header ou de la variable d'env (selon inject) */
  name?: string;
}

export interface McpTemplate {
  /** Serveur MCP distant (Streamable HTTP) */
  url?: string;
  /** Ou serveur stdio local lancé par le gateway */
  command?: string;
  args?: string[];
  /** Catégorie d'outils dans le ToolRegistry du gateway */
  category: string;
  /** Secrets demandés à l'utilisateur */
  secrets: McpSecretField[];
}

export interface CatalogApp {
  slug: string;
  name: string;
  description: string;
  logo: string;
  category: 'ecommerce' | 'marketing' | 'analytics' | 'finance' | 'communication' | 'productivity' | 'google';
  kind: 'mcp' | 'shopify' | 'oauth' | 'native';
  tier?: 'core';
  /** kind === 'mcp' */
  mcp?: McpTemplate;
  /** kind === 'oauth' — chemin de départ du flow */
  oauthPath?: string;
  /** kind === 'native' — platform + champs credentials stockés tels quels */
  nativePlatform?: string;
  nativeFields?: { key: string; label: string; placeholder: string }[];
  docsUrl?: string;
  note?: string;
}

export const CATALOG: CatalogApp[] = [
  // ── Exceptions hors MCP ──
  {
    slug: 'shopify',
    name: 'Shopify',
    description: 'Boutique connectée via l\'API Shopify — produits, stocks, commandes.',
    logo: '🛍️',
    category: 'ecommerce',
    kind: 'shopify',
    tier: 'core',
    note: 'Géré depuis la page Boutiques.',
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    description: 'Alertes des agents et pilotage de la boutique par chat.',
    logo: '✈️',
    category: 'communication',
    kind: 'native',
    tier: 'core',
    nativePlatform: 'telegram',
    nativeFields: [{ key: 'botToken', label: 'Token du bot', placeholder: '1234567890:ABC…' }],
  },

  // ── Apps via MCP ──
  {
    slug: 'klaviyo',
    name: 'Klaviyo',
    description: 'Campagnes et flows email/SMS : panier abandonné, winback, fidélité.',
    logo: 'K',
    category: 'marketing',
    kind: 'mcp',
    tier: 'core',
    mcp: {
      command: 'uvx',
      args: ['klaviyo-mcp-server@latest'],
      category: 'marketing',
      secrets: [{ key: 'apiKey', label: 'Clé API privée Klaviyo', placeholder: 'pk_…', inject: 'env', name: 'PRIVATE_API_KEY' }],
    },
    docsUrl: 'https://developers.klaviyo.com/en/docs/klaviyo_mcp_server',
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    description: 'Paiements, abonnements et revenus — via le serveur MCP officiel Stripe.',
    logo: 'S',
    category: 'finance',
    kind: 'mcp',
    tier: 'core',
    mcp: {
      url: 'https://mcp.stripe.com',
      category: 'finance',
      secrets: [{ key: 'apiKey', label: 'Clé secrète Stripe', placeholder: 'sk_live_…', inject: 'bearer' }],
    },
    docsUrl: 'https://docs.stripe.com/mcp',
  },
  {
    slug: 'notion',
    name: 'Notion',
    description: 'Pages, bases de données et documents de l\'équipe.',
    logo: 'N',
    category: 'productivity',
    kind: 'mcp',
    mcp: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      category: 'productivity',
      secrets: [{ key: 'token', label: 'Token d\'intégration interne Notion', placeholder: 'ntn_…', inject: 'env', name: 'NOTION_TOKEN' }],
    },
    docsUrl: 'https://developers.notion.com/docs/mcp',
  },

  // ── Google via MCP ──
  {
    slug: 'google-search-console',
    name: 'Google Search Console',
    description: 'Performances SEO, mots-clés et positions — via MCP.',
    logo: '🔍',
    category: 'google',
    kind: 'mcp',
    tier: 'core',
    mcp: {
      command: 'npx',
      args: ['-y', 'mcp-server-gsc'],
      category: 'seo',
      secrets: [{
        key: 'credsPath',
        label: 'Chemin du JSON service account Google',
        placeholder: '/chemin/vers/service-account.json',
        inject: 'env',
        name: 'GOOGLE_APPLICATION_CREDENTIALS',
      }],
    },
  },
  {
    slug: 'google-analytics',
    name: 'Google Analytics',
    description: 'Trafic, conversions et tunnel d\'achat (GA4) — serveur MCP officiel Google.',
    logo: '📊',
    category: 'google',
    kind: 'mcp',
    tier: 'core',
    mcp: {
      command: 'uvx',
      args: ['analytics-mcp'],
      category: 'analytics',
      secrets: [{
        key: 'credsPath',
        label: 'Chemin du JSON service account Google',
        placeholder: '/chemin/vers/service-account.json',
        inject: 'env',
        name: 'GOOGLE_APPLICATION_CREDENTIALS',
      }],
    },
    docsUrl: 'https://github.com/googleanalytics/google-analytics-mcp',
  },
  {
    slug: 'google-workspace',
    name: 'Google Workspace',
    description: 'Gmail, Drive, Calendar et Docs — via un serveur MCP Workspace.',
    logo: 'G',
    category: 'google',
    kind: 'mcp',
    mcp: {
      command: 'uvx',
      args: ['workspace-mcp'],
      category: 'productivity',
      secrets: [
        { key: 'clientId', label: 'Google OAuth Client ID', placeholder: '….apps.googleusercontent.com', inject: 'env', name: 'GOOGLE_OAUTH_CLIENT_ID' },
        { key: 'clientSecret', label: 'Google OAuth Client Secret', placeholder: 'GOCSPX-…', inject: 'env', name: 'GOOGLE_OAUTH_CLIENT_SECRET' },
      ],
    },
    docsUrl: 'https://github.com/taylorwilsdon/google_workspace_mcp',
  },
];

export const CATALOG_CATEGORIES = [
  { id: 'all', label: 'Tout' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'google', label: 'Google' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'finance', label: 'Finance' },
  { id: 'communication', label: 'Communication' },
  { id: 'productivity', label: 'Productivité' },
] as const;

/**
 * Construit la config MCP (format attendu par gateway/src/lib/mcp-bridge.ts)
 * à partir du template + des secrets saisis.
 */
export function buildMcpCredentials(app: CatalogApp, secrets: Record<string, string>): Record<string, any> {
  const tpl = app.mcp!;
  const config: Record<string, any> = { category: tpl.category };
  if (tpl.url) config.url = tpl.url;
  if (tpl.command) {
    config.command = tpl.command;
    config.args = tpl.args ?? [];
  }
  for (const field of tpl.secrets) {
    const value = (secrets[field.key] || '').trim();
    if (!value) continue;
    if (field.inject === 'bearer') {
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${value}` };
    } else if (field.inject === 'header' && field.name) {
      config.headers = { ...(config.headers || {}), [field.name]: value };
    } else if (field.inject === 'env' && field.name) {
      config.env = { ...(config.env || {}), [field.name]: value };
    }
  }
  return config;
}
