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

/**
 * Comment l'app s'authentifie :
 *  - `secrets`      : l'utilisateur colle une clé API (formulaire).
 *  - `oauth-mcp`    : OAuth 2.1 du protocole MCP (découverte RFC 9728 + DCR + PKCE).
 *                     Un clic, un écran de consentement, aucun secret saisi.
 *  - `oauth-google` : OAuth Google porté par Armada — les serveurs MCP Google
 *                     n'exposent pas d'endpoint distant, donc c'est nous qui
 *                     tenons le flow et passons les credentials au serveur stdio.
 */
export type McpAuthType = 'secrets' | 'oauth-mcp' | 'oauth-google';

export interface McpTemplate {
  /** Serveur MCP distant (Streamable HTTP) */
  url?: string;
  /** Ou serveur stdio local lancé par le gateway */
  command?: string;
  args?: string[];
  /** Catégorie d'outils dans le ToolRegistry du gateway */
  category: string;
  auth: McpAuthType;
  /** `secrets` uniquement — champs demandés à l'utilisateur */
  secrets: McpSecretField[];
  /** `oauth-mcp` — scopes de repli si le serveur n'en annonce aucun */
  scope?: string;
  /** `oauth-google` — scopes Google demandés au consentement */
  googleScopes?: string[];
  /** Limite les outils exposés aux agents (évite de saturer le prompt) */
  allowedTools?: string[];
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
  /** Affichée mais non connectable — `note` explique pourquoi. */
  unavailable?: boolean;
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
    // Connexion native : le gateway embarque un passthrough complet de l'API
    // Klaviyo (callKlaviyoApi / write), activé dès que l'intégration existe.
    // Pas de dépendance uvx/npx sur la machine du gateway.
    slug: 'klaviyo',
    name: 'Klaviyo',
    description: 'Campagnes et flows email/SMS : panier abandonné, winback, fidélité.',
    logo: 'K',
    category: 'marketing',
    kind: 'native',
    tier: 'core',
    nativePlatform: 'klaviyo',
    nativeFields: [{ key: 'apiKey', label: 'Clé API privée Klaviyo', placeholder: 'pk_…' }],
    docsUrl: 'https://developers.klaviyo.com/en/reference/api_overview',
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
      auth: 'secrets',
      secrets: [{ key: 'apiKey', label: 'Clé secrète Stripe', placeholder: 'sk_live_…', inject: 'bearer' }],
    },
    docsUrl: 'https://docs.stripe.com/mcp',
  },
  {
    // Serveur MCP distant officiel : OAuth 2.1 de bout en bout, aucun token à
    // créer côté Notion. Remplace l'ancien stdio + token d'intégration interne.
    slug: 'notion',
    name: 'Notion',
    description: 'Pages, bases de données et documents de l\'équipe.',
    logo: 'N',
    category: 'productivity',
    kind: 'mcp',
    mcp: {
      url: 'https://mcp.notion.com/mcp',
      category: 'productivity',
      auth: 'oauth-mcp',
      secrets: [],
    },
    docsUrl: 'https://developers.notion.com/docs/mcp',
  },

  // ── Google ──
  // Aucun de ces services n'a de serveur MCP distant hébergé par Google : c'est
  // donc Armada qui porte le flow OAuth, puis passe les credentials au serveur.
  {
    // `mcp-server-gsc` n'accepte QUE des service accounts (pas d'ADC utilisateur),
    // ce qui imposerait au marchand d'ajouter un compte de service dans sa GSC.
    // On garde donc les tools GSC natifs du gateway, déjà en OAuth avec refresh.
    slug: 'google-search-console',
    name: 'Google Search Console',
    description: 'Performances SEO, mots-clés et positions.',
    logo: '🔍',
    category: 'google',
    kind: 'oauth',
    tier: 'core',
    oauthPath: '/api/auth/google?slug=google-search-console',
    nativePlatform: 'google-search-console',
  },
  {
    // ADC "authorized_user" : le gateway écrit un fichier de credentials à partir
    // du refresh token OAuth, que google-auth rafraîchit ensuite tout seul.
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
      auth: 'oauth-google',
      secrets: [],
      googleScopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    },
    docsUrl: 'https://github.com/googleanalytics/google-analytics-mcp',
  },
  {
    // `workspace-mcp` gère son propre magasin de credentials (dossier .credentials/)
    // et ne sait pas consommer des ADC : impossible de lui injecter notre token.
    // La voie propre est de le déployer à côté du gateway en
    // `--transport streamable-http` avec MCP_ENABLE_OAUTH21=true, puis de
    // l'ajouter comme serveur MCP personnalisé — l'OAuth 2.1 générique le prend
    // alors en charge sans code supplémentaire.
    slug: 'google-workspace',
    name: 'Google Workspace',
    description: 'Gmail, Drive, Calendar et Docs.',
    logo: 'G',
    category: 'google',
    kind: 'mcp',
    unavailable: true,
    note: 'Nécessite de déployer workspace-mcp en service HTTP séparé, puis de l\'ajouter comme serveur MCP personnalisé.',
    mcp: {
      command: 'uvx',
      args: ['workspace-mcp'],
      category: 'productivity',
      auth: 'oauth-google',
      secrets: [],
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
 * URL de démarrage du flow de connexion, ou `null` si l'app se connecte par
 * formulaire (saisie de secrets). Une valeur non nulle = connexion en un clic.
 */
export function connectUrlFor(app: CatalogApp): string | null {
  if (app.unavailable) return null;
  if (app.kind === 'oauth') return app.oauthPath ?? null;
  if (app.kind === 'mcp') {
    if (app.mcp?.auth === 'oauth-mcp') return `/api/mcp/oauth/start?slug=${app.slug}`;
    if (app.mcp?.auth === 'oauth-google') return `/api/auth/google?slug=${app.slug}`;
  }
  return null;
}

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
