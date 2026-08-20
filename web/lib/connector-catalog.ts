export type ConnectorTrust = 'armada_verified' | 'publisher_verified' | 'community' | 'custom';
export type ConnectorTransport = 'streamable-http' | 'stdio';
export type ConnectorAuth = 'oauth-google' | 'oauth-mcp' | 'secret';

export interface CuratedConnector {
  slug: string;
  name: string;
  description: string;
  publisher: string;
  category: string;
  logo: string;
  endpoint?: string;
  transport: ConnectorTransport;
  authMode: ConnectorAuth;
  verificationTier: ConnectorTrust;
  version?: string;
  digest?: string;
  packageConfig?: Record<string, any>;
  scopes?: string[];
  isBeta?: boolean;
  capabilities: string[];
  secretFields?: Array<{ key: string; label: string; placeholder: string; header?: string; bearer?: boolean }>;
  docsUrl?: string;
}

const GOOGLE = {
  publisher: 'Google',
  category: 'google',
  verificationTier: 'publisher_verified' as const,
  transport: 'streamable-http' as const,
  authMode: 'oauth-google' as const,
  isBeta: true,
};

export const CURATED_CONNECTORS: CuratedConnector[] = [
  {
    ...GOOGLE, slug: 'gmail', name: 'Gmail', logo: '✉️', endpoint: 'https://gmailmcp.googleapis.com/mcp/v1',
    description: 'Rechercher, lire, classer et préparer des e-mails.',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'],
    capabilities: ['Rechercher les conversations', 'Lire les messages', 'Créer des brouillons', 'Gérer les libellés'],
  },
  {
    ...GOOGLE, slug: 'google-drive', name: 'Google Drive', logo: '📁', endpoint: 'https://drivemcp.googleapis.com/mcp/v1',
    description: 'Rechercher, lire, créer et organiser les fichiers Drive.',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
    capabilities: ['Rechercher des fichiers', 'Lire le contenu', 'Créer et copier des fichiers'],
  },
  {
    ...GOOGLE, slug: 'google-calendar', name: 'Google Calendar', logo: '📅', endpoint: 'https://calendarmcp.googleapis.com/mcp/v1',
    description: 'Consulter les agendas et gérer les événements.',
    scopes: ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.events'],
    capabilities: ['Lister et rechercher les événements', 'Créer et modifier des événements', 'Proposer des créneaux'],
  },
  {
    ...GOOGLE, slug: 'google-docs', name: 'Google Docs', logo: '📄', endpoint: 'https://docsmcp.googleapis.com/mcp/v1',
    description: 'Lire et modifier les documents Google Docs.',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/documents.readonly', 'https://www.googleapis.com/auth/documents'],
    capabilities: ['Lire un document', 'Mettre à jour un document'],
  },
  {
    ...GOOGLE, slug: 'google-sheets', name: 'Google Sheets', logo: '📗', endpoint: 'https://sheetsmcp.googleapis.com/mcp/v1',
    description: 'Analyser et mettre à jour les feuilles de calcul.',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/spreadsheets'],
    capabilities: ['Lire les valeurs', 'Analyser une feuille', 'Mettre à jour valeurs et formules'],
  },
  {
    ...GOOGLE, slug: 'google-slides', name: 'Google Slides', logo: '📙', endpoint: 'https://slidesmcp.googleapis.com/mcp/v1',
    description: 'Lire et mettre à jour les présentations.',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/presentations.readonly', 'https://www.googleapis.com/auth/presentations'],
    capabilities: ['Lire une présentation', 'Mettre à jour une présentation'],
  },
  {
    ...GOOGLE, slug: 'google-people', name: 'Google Contacts', logo: '👥', endpoint: 'https://people.googleapis.com/mcp/v1',
    description: 'Consulter le profil, les contacts et l’annuaire.',
    scopes: ['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/directory.readonly'],
    capabilities: ['Lire le profil', 'Rechercher contacts et collaborateurs'],
  },
  {
    ...GOOGLE, slug: 'google-chat', name: 'Google Chat', logo: '💬', endpoint: 'https://chatmcp.googleapis.com/mcp/v1',
    description: 'Rechercher les conversations et envoyer des messages.',
    scopes: ['https://www.googleapis.com/auth/chat.spaces.readonly', 'https://www.googleapis.com/auth/chat.messages.readonly', 'https://www.googleapis.com/auth/chat.messages.create'],
    capabilities: ['Rechercher les conversations', 'Lire et envoyer des messages'],
  },
  {
    slug: 'google-analytics', name: 'Google Analytics', logo: '📊', publisher: 'Google Analytics', category: 'analytics',
    description: 'Analyser les propriétés GA4, rapports, tunnels et temps réel.',
    transport: 'stdio', authMode: 'oauth-google', verificationTier: 'armada_verified', isBeta: true,
    version: '0.7.0', packageConfig: { command: 'uvx', args: ['analytics-mcp==0.7.0'] },
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    capabilities: ['Lister les propriétés', 'Lancer des rapports', 'Analyser les tunnels et le temps réel'],
    docsUrl: 'https://github.com/googleanalytics/google-analytics-mcp',
  },
  {
    slug: 'google-search-console', name: 'Google Search Console', logo: '🔎', publisher: 'Armada', category: 'analytics',
    description: 'Analyser les requêtes, pages, positions et opportunités SEO.',
    transport: 'stdio', authMode: 'oauth-google', verificationTier: 'armada_verified',
    version: '2.0.0', packageConfig: { command: 'node', args: ['dist/gsc-mcp.js'] },
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    capabilities: ['Lister les propriétés', 'Analyser requêtes et pages', 'Détecter les opportunités SEO'],
  },
  {
    slug: 'notion', name: 'Notion', logo: 'N', publisher: 'Notion', category: 'productivity',
    description: 'Rechercher et gérer les pages et bases de données Notion.', endpoint: 'https://mcp.notion.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified', capabilities: ['Rechercher', 'Lire', 'Créer et modifier'],
  },
  {
    slug: 'stripe', name: 'Stripe', logo: 'S', publisher: 'Stripe', category: 'finance',
    description: 'Consulter paiements, abonnements et revenus via le MCP officiel.', endpoint: 'https://mcp.stripe.com',
    transport: 'streamable-http', authMode: 'secret', verificationTier: 'publisher_verified', capabilities: ['Paiements', 'Clients', 'Abonnements'],
    secretFields: [{ key: 'apiKey', label: 'Clé secrète Stripe', placeholder: 'sk_live_…', bearer: true }],
  },

  // Remote MCP servers published by the vendor, all OAuth 2.1 with Dynamic Client
  // Registration — the merchant connects them without ever pasting a secret.
  // Endpoints and DCR support verified against each publisher's
  // /.well-known/oauth-authorization-server before being curated here.
  {
    slug: 'klaviyo', name: 'Klaviyo', logo: 'K', publisher: 'Klaviyo', category: 'marketing',
    description: 'Campagnes, flows, segments, profils et rapports e-mail/SMS.', endpoint: 'https://mcp.klaviyo.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Campagnes et flows', 'Listes et segments', 'Profils clients', 'Rapports de performance'],
  },
  {
    slug: 'intercom', name: 'Intercom', logo: '💬', publisher: 'Intercom', category: 'support',
    description: 'Consulter les conversations, contacts et articles du support.', endpoint: 'https://mcp.intercom.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Rechercher les conversations', 'Lire les contacts', 'Consulter les articles'],
  },
  {
    slug: 'canva', name: 'Canva', logo: '🎨', publisher: 'Canva', category: 'creative',
    description: 'Rechercher, créer et exporter des visuels et gabarits de marque.', endpoint: 'https://mcp.canva.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Rechercher des designs', 'Créer depuis un gabarit', 'Exporter des visuels'],
  },
  {
    slug: 'paypal', name: 'PayPal', logo: '💳', publisher: 'PayPal', category: 'finance',
    description: 'Consulter transactions, litiges et factures PayPal.', endpoint: 'https://mcp.paypal.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Transactions', 'Litiges', 'Factures'],
  },
  {
    slug: 'square', name: 'Square', logo: '⬜', publisher: 'Block', category: 'finance',
    description: 'Paiements, catalogue et clients Square.', endpoint: 'https://mcp.squareup.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Paiements', 'Catalogue', 'Clients'],
  },
  {
    slug: 'linear', name: 'Linear', logo: '📐', publisher: 'Linear', category: 'productivity',
    description: 'Suivre et créer les tickets, projets et cycles produit.', endpoint: 'https://mcp.linear.app/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Rechercher les tickets', 'Créer et mettre à jour', 'Suivre les projets'],
  },
  {
    slug: 'asana', name: 'Asana', logo: '✅', publisher: 'Asana', category: 'productivity',
    description: 'Consulter et gérer les tâches, projets et portefeuilles.', endpoint: 'https://mcp.asana.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Lister les tâches', 'Créer et assigner', 'Suivre les projets'],
  },
  {
    slug: 'sentry', name: 'Sentry', logo: '🐛', publisher: 'Sentry', category: 'engineering',
    description: 'Analyser les erreurs et incidents de la boutique.', endpoint: 'https://mcp.sentry.dev/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['Lister les erreurs', 'Analyser une exception', 'Suivre les releases'],
  },
  {
    slug: 'cloudflare', name: 'Cloudflare', logo: '☁️', publisher: 'Cloudflare', category: 'engineering',
    description: 'Consulter DNS, cache, analytics et règles de sécurité.', endpoint: 'https://mcp.cloudflare.com/mcp',
    transport: 'streamable-http', authMode: 'oauth-mcp', verificationTier: 'publisher_verified',
    capabilities: ['DNS et cache', 'Analytics', 'Règles de sécurité'],
  },
];

export async function ensureCuratedConnectors(prisma: any) {
  await Promise.all(CURATED_CONNECTORS.map((connector) => prisma.connectorDefinition.upsert({
    where: { slug: connector.slug },
    create: {
      slug: connector.slug, name: connector.name, description: connector.description,
      publisher: connector.publisher, source: 'armada', version: connector.version,
      digest: connector.digest, transport: connector.transport, authMode: connector.authMode,
      verificationTier: connector.verificationTier, category: connector.category, logo: connector.logo,
      endpoint: connector.endpoint, packageConfig: connector.packageConfig,
      scopes: connector.scopes || [], toolMetadata: [], riskOverrides: {}, isBeta: !!connector.isBeta,
    },
    update: {
      name: connector.name, description: connector.description, publisher: connector.publisher,
      version: connector.version, digest: connector.digest, transport: connector.transport,
      authMode: connector.authMode, verificationTier: connector.verificationTier,
      category: connector.category, logo: connector.logo, endpoint: connector.endpoint,
      packageConfig: connector.packageConfig, scopes: connector.scopes || [], isBeta: !!connector.isBeta,
    },
  })));
}
