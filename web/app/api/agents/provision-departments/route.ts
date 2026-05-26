/**
 * POST /api/agents/provision-departments
 *
 * Smart provisioning — idempotent, avoids redundancy:
 *   - Checks existing agents by department keyword coverage (not just exact type)
 *   - Only CREATES agents for departments with no coverage at all
 *   - UPGRADES capabilities of existing agents that cover a department
 *
 * Departments:
 *   - Growth & Acquisition  → create "Alex" (growth) if no growth-type agent exists
 *   - Finance & Analytique  → create "Sofia" (finance) — always new
 *   - Publicité & Ads       → create "Marco" (ads) if no marketing/email agent exists
 *   - CX VIP                → create "Luna" (cx) — always new
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─── Department definitions ───────────────────────────────────────────────────

interface DeptDef {
  type: string;
  name: string;
  designation: string;
  personality: string;
  systemPrompt: string;
  capabilities: { allowed: string[] };
  /** Type keywords — if ANY existing agent's type contains one, dept is "covered" */
  coverageKeywords: string[];
  /** Capabilities to ADD to the covering agent (merged, no duplicates) */
  capabilityUpgrade: string[];
}

const DEPARTMENTS: DeptDef[] = [
  {
    type: 'growth',
    name: 'Alex',
    designation: 'GRW-01',
    personality: 'Growth Hacker — Acquisition & Conversion Specialist',
    systemPrompt: `Tu es Alex, Growth Hacker de l'équipe Armada.

Ta mission : faire croître le business de manière mesurable et rapide.

## TES RESPONSABILITÉS
- Analyser les performances de trafic et identifier les opportunités d'acquisition
- Rechercher et analyser la concurrence (web_browse pour crawler les sites)
- Optimiser le SEO produit et collection (titres, descriptions, métachamps)
- Identifier les pages produit avec un potentiel inexploité
- Proposer des stratégies de croissance basées sur les données GSC
- Créer des redirections pour corriger les erreurs 404

## TES OUTILS
- web_browse : analyser n'importe quelle URL (concurrents, ton propre store)
- product_get_by_handle : trouver un produit par son URL
- storefront_url : construire les URLs publiques
- redirect_create : créer des redirections
- product_update_metafields : optimiser les métachamps SEO
- product_update : mettre à jour les fiches produit
- search_performance, top_keywords, page_performance : analytics GSC

## TON STYLE
Tu es direct et orienté résultats. Tu penses en termes de métriques (trafic, conversions, ROAS).
Tes recommandations sont toujours accompagnées de données et d'un impact estimé.

Réponds toujours en français.`,
    capabilities: { allowed: ['products', 'web', 'seo', 'store', 'collections'] },
    coverageKeywords: ['growth', 'acquisition', 'hacker', 'paid'],
    capabilityUpgrade: ['web', 'seo', 'collections'],
  },
  {
    type: 'finance',
    name: 'Sofia',
    designation: 'FIN-01',
    personality: 'CFO IA — Finance & Business Analytics',
    systemPrompt: `Tu es Sofia, CFO IA de l'équipe Armada.

Ta mission : donner une vision claire et précise de la santé financière du business.

## TES RESPONSABILITÉS
- Analyser les revenus, marges et tendances des ventes
- Détecter les fuites de revenus (produits peu performants, abandons panier)
- Produire des rapports P&L hebdomadaires et mensuels
- Calculer les métriques clés : panier moyen, LTV client, taux de retour
- Identifier les clients à risque de churn (faible fréquence d'achat)
- Suivre les coûts et optimiser la rentabilité

## TES OUTILS
- order_list, order_get : analyse des commandes
- customer_list, customer_search : segmentation client
- product_list : analyse du catalogue vs performance
- store_get_info : informations globales

## FORMAT DES RAPPORTS
Toujours présenter : chiffres clés → tendances → alertes → recommandations.
Utilise des tableaux et pourcentages. Reste factuel, sans embellissement.

Réponds toujours en français.`,
    capabilities: { allowed: ['orders', 'customers', 'products', 'store', 'inventory'] },
    coverageKeywords: ['finance', 'cfo', 'analyt', 'reporting', 'p&l'],
    capabilityUpgrade: [],
  },
  {
    type: 'ads',
    name: 'Marco',
    designation: 'ADS-01',
    personality: 'Ad Manager IA — Performance & ROAS',
    systemPrompt: `Tu es Marco, Ad Manager IA de l'équipe Armada.

Ta mission : gérer et optimiser toutes les campagnes publicitaires pour maximiser le ROAS.

## TES RESPONSABILITÉS
- Gérer les campagnes email et SMS Klaviyo (création, scheduling, A/B tests)
- Analyser les performances des campagnes (open rate, CTR, revenue généré)
- Créer des segments d'audience précis basés sur le comportement client
- Optimiser les flows automatiques (abandon panier, winback, welcome series)
- Rédiger des copy d'emails et SMS performants
- Proposer un calendrier éditorial pour les communications marketing

## TES OUTILS
- call_klaviyo_api : accès complet à l'API Klaviyo (campagnes, flows, segments, profils, métriques)
  → Pour lister les campagnes : GET /api/campaigns/
  → Pour créer un segment : POST /api/segments/
  → Pour les métriques : GET /api/metrics/
- customer_list, customer_search : données clients pour ciblage
- web_browse : analyser les tendances et concurrents

## TON STYLE
Tu penses en termes de revenus générés et ROAS. Chaque recommandation inclut un objectif mesurable.
Tu connais les meilleures pratiques email/SMS marketing.

Réponds toujours en français.`,
    capabilities: { allowed: ['marketing', 'customers', 'web', 'store'] },
    coverageKeywords: ['email', 'marketing', 'klaviyo', 'campaign', 'ads', 'sms'],
    capabilityUpgrade: ['web', 'customers'],
  },
  {
    type: 'cx',
    name: 'Luna',
    designation: 'CX-01',
    personality: 'CX Manager IA — Rétention & Expérience Client VIP',
    systemPrompt: `Tu es Luna, CX Manager IA de l'équipe Armada.

Ta mission : maximiser la satisfaction, la rétention et la valeur vie des clients.

## TES RESPONSABILITÉS
- Identifier et segmenter les clients VIP (haute LTV, acheteurs récurrents)
- Détecter les clients à risque de churn et préparer des stratégies de rétention
- Analyser les retours, réclamations et tendances de satisfaction
- Créer des tags et segments Shopify pour personnaliser l'expérience
- Préparer des communications VIP personnalisées via Klaviyo
- Proposer des programmes de fidélité et offres de rétention

## TES OUTILS
- customer_list, customer_get, customer_search : base clients complète
- customer_update_tags : segmentation et tagging
- call_klaviyo_api : communications email/SMS ciblées
- order_list : analyse des comportements d'achat

## SEGMENTATION VIP
Critères à analyser : nombre de commandes, valeur totale, dernière commande (RFM model).
Segment VIP = top 20% en valeur. Segment à risque = pas d'achat depuis 90+ jours.

Réponds toujours en français.`,
    capabilities: { allowed: ['customers', 'orders', 'marketing', 'products'] },
    coverageKeywords: ['cx', 'vip', 'retention', 'fidel', 'customer_success', 'support'],
    capabilityUpgrade: [],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the existing agent whose type string matches any coverage keyword, or null */
function findCoveringAgent(
  agents: Array<{ id: string; type: string; capabilities: unknown }>,
  dept: DeptDef,
): { id: string; type: string; capabilities: unknown } | null {
  for (const agent of agents) {
    const t = agent.type.toLowerCase();
    if (dept.coverageKeywords.some((kw) => t.includes(kw))) return agent;
  }
  return null;
}

/** Merge capability arrays without duplicates */
function mergeCapabilities(
  existing: unknown,
  toAdd: string[],
): { allowed: string[] } {
  const base =
    existing &&
    typeof existing === 'object' &&
    'allowed' in (existing as object)
      ? ((existing as { allowed: string[] }).allowed ?? [])
      : [];
  const merged = Array.from(new Set([...base, ...toAdd]));
  return { allowed: merged };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    // Check store exists
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, storeName: true },
    });
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Load ALL existing agents for this store (not just the 4 dept types)
    const existingAgents = await prisma.agent.findMany({
      where: { storeId, isActive: true },
      select: { id: true, type: true, name: true, capabilities: true },
    });

    const results: {
      type: string;
      name: string;
      designation: string;
      status: 'created' | 'exists' | 'upgraded' | 'covered';
      coveredBy?: string;
    }[] = [];

    for (const dept of DEPARTMENTS) {
      // 1. Check exact type match (already provisioned as a dept agent)
      const exactMatch = existingAgents.find((a) => a.type === dept.type);
      if (exactMatch) {
        results.push({
          type: dept.type,
          name: dept.name,
          designation: dept.designation,
          status: 'exists',
        });
        continue;
      }

      // 2. Check if an existing agent already covers this department
      const covering = findCoveringAgent(existingAgents, dept);

      if (covering) {
        // Upgrade capabilities of the covering agent if needed
        if (dept.capabilityUpgrade.length > 0) {
          const merged = mergeCapabilities(covering.capabilities, dept.capabilityUpgrade);
          await prisma.agent.update({
            where: { id: covering.id },
            data: { capabilities: merged },
          });
          results.push({
            type: dept.type,
            name: dept.name,
            designation: dept.designation,
            status: 'upgraded',
            coveredBy: covering.type,
          });
        } else {
          results.push({
            type: dept.type,
            name: dept.name,
            designation: dept.designation,
            status: 'covered',
            coveredBy: covering.type,
          });
        }
        continue;
      }

      // 3. No coverage at all → create the department agent
      await prisma.agent.create({
        data: {
          agentId: `${dept.type}-${storeId}`,
          name: dept.name,
          type: dept.type,
          personality: dept.personality,
          systemPrompt: dept.systemPrompt,
          capabilities: dept.capabilities,
          modelProvider: 'openai',
          modelName: 'gpt-4o',
          isActive: true,
          storeId,
        },
      });

      results.push({
        type: dept.type,
        name: dept.name,
        designation: dept.designation,
        status: 'created',
      });
    }

    const created = results.filter((r) => r.status === 'created').length;
    const upgraded = results.filter((r) => r.status === 'upgraded').length;

    let message = '';
    if (created === 0 && upgraded === 0) {
      message = 'Tous les départements sont déjà couverts par l\'équipe existante.';
    } else {
      const parts = [];
      if (created > 0) parts.push(`${created} nouvel agent créé${created > 1 ? 's' : ''}`);
      if (upgraded > 0) parts.push(`${upgraded} agent${upgraded > 1 ? 's' : ''} mis à jour`);
      message = `${parts.join(', ')}. Rechargez le gateway pour activer les changements.`;
    }

    return NextResponse.json({ success: true, results, message });
  } catch (error) {
    console.error('Error provisioning departments:', error);
    return NextResponse.json({ error: 'Failed to provision departments' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const existingAgents = await prisma.agent.findMany({
    where: { storeId, isActive: true },
    select: { id: true, type: true, name: true, capabilities: true },
  });

  const departments = DEPARTMENTS.map((d) => {
    const exactMatch = existingAgents.find((a) => a.type === d.type);
    const covering = exactMatch ? null : findCoveringAgent(existingAgents, d);

    return {
      type: d.type,
      name: d.name,
      designation: d.designation,
      role: d.personality.split(' — ')[0],
      specialty: d.personality.split(' — ')[1] ?? '',
      capabilities: d.capabilities.allowed,
      deployed: !!(exactMatch || covering),
      coveredBy: covering ? covering.type : undefined,
      coveredByName: covering
        ? (existingAgents.find((a) => a.type === covering.type)?.name ?? undefined)
        : undefined,
    };
  });

  return NextResponse.json({ departments });
}
