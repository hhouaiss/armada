import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/onboarding/generate-agents
 *
 * Armada is an ecommerce-specialized agentic platform. Onboarding does NOT
 * free-invent arbitrary roles — it proposes a FIXED ecommerce squad whose roles
 * map 1:1 to the agents that are actually provisioned for a Shopify store
 * (see /api/shopify/callback defaults + /api/agents/provision-departments).
 *
 * The LLM (Gemma via OpenRouter, ~$0.002/call) only PERSONALIZES the squad:
 * names, tone and one-line descriptions tailored to the merchant's store and
 * goals. If no key (or the call fails), we return the canonical roster as-is.
 */

// ── Canonical ecommerce squad ─────────────────────────────────────────────────
// `type` aligns with what gets created on deploy so the preview is honest.

interface RosterAgent {
  name: string;
  role: string;
  designation: string;
  type: string; // maps to provisioned Agent.type
  description: string;
  capabilities: string[];
  tone: string;
  personality: string;
}

const ECOMMERCE_ROSTER: RosterAgent[] = [
  {
    name: 'Sophie',
    role: 'Merchandising & Catalogue',
    designation: 'SHP-01',
    type: 'product',
    description: 'Optimise vos fiches produit, collections et SEO produit pour vendre plus.',
    capabilities: ['Fiches produit', 'Collections', 'SEO produit', 'Métachamps'],
    tone: 'Professionnel',
    personality: 'Analytique et orientée conversion.',
  },
  {
    name: 'Marcus',
    role: 'Stock & Réapprovisionnement',
    designation: 'SHP-02',
    type: 'inventory',
    description: 'Anticipe les ruptures, surveille le stock et prépare vos réappros.',
    capabilities: ['Alertes stock', 'Réappro', 'Prévisions', 'Multi-emplacements'],
    tone: 'Direct',
    personality: 'Rigoureux et proactif.',
  },
  {
    name: 'Alex',
    role: 'SEO & Croissance',
    designation: 'GRW-01',
    type: 'growth',
    description: 'Analyse votre trafic, surveille la concurrence et capte la demande organique.',
    capabilities: ['SEO', 'Search Console', 'Analyse concurrence', 'Redirections'],
    tone: 'Direct',
    personality: 'Orienté résultats, pense en métriques.',
  },
  {
    name: 'Marco',
    role: 'Marketing & Rétention',
    designation: 'MKT-01',
    type: 'ads',
    description: 'Pilote vos campagnes et flows Klaviyo : panier abandonné, winback, fidélité.',
    capabilities: ['Email & SMS', 'Flows Klaviyo', 'Segments', 'Panier abandonné'],
    tone: 'Créatif',
    personality: 'Pense en revenus générés et ROAS.',
  },
  {
    name: 'Luna',
    role: 'Support & Expérience Client',
    designation: 'CX-01',
    type: 'support',
    description: 'Gère le support, les retours et segmente vos clients VIP.',
    capabilities: ['Support', 'Retours', 'Tags VIP', 'Rétention'],
    tone: 'Chaleureux',
    personality: 'Empathique et réactive.',
  },
  {
    name: 'Sofia',
    role: 'Finance & Analytics',
    designation: 'FIN-01',
    type: 'finance',
    description: 'Suit revenus, marges, panier moyen et LTV — et alerte sur les fuites.',
    capabilities: ['Revenus & marges', 'Panier moyen', 'LTV', 'Rapports P&L'],
    tone: 'Analytique',
    personality: 'Précise et factuelle.',
  },
];

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { businessName, description, goals, storeDomain } = body;

  const goalsText = Array.isArray(goals) ? goals.join(', ') : (goals || '');
  const apiKey = process.env.OPENROUTER_API_KEY;

  // No LLM key → return the canonical roster as-is.
  if (!apiKey) {
    return NextResponse.json({ agents: ECOMMERCE_ROSTER, source: 'fallback' });
  }

  const systemPrompt = `Tu personnalises une escouade d'agents IA e-commerce pour une boutique Shopify.
Tu NE changes PAS les rôles ni l'ordre des agents. Tu adaptes uniquement le prénom, le ton et la description (1 phrase concrète liée à CETTE boutique).
Réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `Boutique : ${businessName || 'Non précisé'}${storeDomain ? ` (${storeDomain})` : ''}
Description : ${description || 'Non précisée'}
Objectifs e-commerce : ${goalsText || 'Non précisés'}

Voici l'escouade fixe (NE change PAS "role", "designation", "type" ni "capabilities").
Pour chaque agent, adapte "name" (prénom FR), "tone" (Professionnel|Chaleureux|Analytique|Direct|Créatif) et "description" (1 phrase concrète pour cette boutique) :
${JSON.stringify(ECOMMERCE_ROSTER, null, 2)}

Retourne exactement ce JSON (pas de texte autour) :
{ "agents": [ /* les ${ECOMMERCE_ROSTER.length} agents, même ordre, mêmes role/designation/type/capabilities */ ] }`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://armada.app',
        'X-Title': 'Armada — Onboarding e-commerce',
      },
      body: JSON.stringify({
        model: 'google/gemma-2-27b-it',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1600,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      console.error('OpenRouter error:', await response.text());
      return NextResponse.json({ agents: ECOMMERCE_ROSTER, source: 'fallback' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ agents: ECOMMERCE_ROSTER, source: 'fallback' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const llmAgents = Array.isArray(parsed.agents) ? parsed.agents : [];

    // Merge: keep canonical role/designation/type/capabilities, accept LLM's
    // name/tone/description. This guarantees the preview stays a valid ecommerce
    // squad even if the model drifts.
    const agents = ECOMMERCE_ROSTER.map((base, i) => {
      const llm = llmAgents[i] || {};
      return {
        ...base,
        name: typeof llm.name === 'string' && llm.name.trim() ? llm.name.trim() : base.name,
        tone: typeof llm.tone === 'string' && llm.tone.trim() ? llm.tone.trim() : base.tone,
        description:
          typeof llm.description === 'string' && llm.description.trim()
            ? llm.description.trim()
            : base.description,
      };
    });

    return NextResponse.json({ agents, source: 'llm' });
  } catch (err) {
    console.error('Agent generation error:', err);
    return NextResponse.json({ agents: ECOMMERCE_ROSTER, source: 'fallback' });
  }
}
