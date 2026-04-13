import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/onboarding/generate-agents
 * Uses Gemma 4 (OpenRouter, cheap ~$0.002/call) to generate 3 custom agents
 * based on the user's business type and goals.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { businessType, businessName, description, goals, teamSize } = body;

  if (!businessType || !goals?.length) {
    return NextResponse.json({ error: 'businessType and goals are required' }, { status: 400 });
  }

  const goalsText = Array.isArray(goals) ? goals.join(', ') : goals;

  const systemPrompt = `Tu es un expert en IA d'entreprise. Tu crées des équipes d'agents IA sur mesure pour des business.
Réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `Crée exactement 3 agents IA pour ce business :

Business : ${businessName || 'Non précisé'}
Type : ${businessType}
Taille d'équipe : ${teamSize || 'non précisée'}
Description : ${description || 'Non précisée'}
Objectifs principaux : ${goalsText}

Pour chaque agent, génère :
- name: un prénom français (ex: Marie, Thomas, Léa)
- role: titre de poste clair et concis (ex: "Responsable CRM", "Analyste Data")
- designation: code court 6 caractères (ex: SPEC-01)
- description: 1 phrase décrivant sa valeur concrète pour CE business
- capabilities: tableau de 3-4 compétences clés liées aux objectifs
- tone: ton de communication ("Professionnel", "Chaleureux", "Analytique", "Direct", "Créatif")
- personality: 1 phrase sur sa personnalité et façon de travailler

Retourne exactement ce JSON (pas de texte autour) :
{
  "agents": [
    {
      "name": "...",
      "role": "...",
      "designation": "...",
      "description": "...",
      "capabilities": ["...", "...", "..."],
      "tone": "...",
      "personality": "..."
    }
  ]
}`;

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    // Fallback: return sensible default agents if no OpenRouter key
    return NextResponse.json({
      agents: getDefaultAgents(businessType, goals),
      source: 'fallback',
    });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://armada.app',
        'X-Title': 'Armada HQ — Onboarding',
      },
      body: JSON.stringify({
        model: 'google/gemma-2-27b-it',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter error:', err);
      return NextResponse.json({
        agents: getDefaultAgents(businessType, goals),
        source: 'fallback',
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response (strip any surrounding markdown if present)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        agents: getDefaultAgents(businessType, goals),
        source: 'fallback',
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const agents = parsed.agents?.slice(0, 3) || getDefaultAgents(businessType, goals);

    return NextResponse.json({ agents, source: 'llm' });
  } catch (err) {
    console.error('Agent generation error:', err);
    return NextResponse.json({
      agents: getDefaultAgents(businessType, goals),
      source: 'fallback',
    });
  }
}

// ── Fallback agents per business type ─────────────────────────────────────────

function getDefaultAgents(businessType: string, goals: string[]): any[] {
  const goalText = goals[0] || '';
  const defaults: Record<string, any[]> = {
    ecommerce: [
      { name: 'Sophie', role: 'Spécialiste Produit', designation: 'SPEC-01', description: 'Optimise votre catalogue et vos fiches produit.', capabilities: ['Catalogue', 'Prix', 'Vente croisée', 'SEO produit'], tone: 'Professionnel', personality: 'Analytique et orientée résultats.' },
      { name: 'Marcus', role: 'Gestionnaire Stock', designation: 'SPEC-02', description: 'Anticipe les ruptures et automatise les réapprovisionnements.', capabilities: ['Alertes stock', 'Réapprovisionnement', 'Prévisions', 'Fournisseurs'], tone: 'Direct', personality: 'Rigoureux et proactif.' },
      { name: 'Léa', role: 'Créatrice de Contenu', designation: 'SPEC-03', description: 'Génère du contenu engageant pour votre boutique.', capabilities: ['Descriptions', 'Blog', 'Email', 'Réseaux sociaux'], tone: 'Créatif', personality: 'Créative et à l\'écoute de votre marque.' },
    ],
    agency: [
      { name: 'Thomas', role: 'Chef de Projet', designation: 'SPEC-01', description: 'Coordonne vos projets et envoie des rapports d\'avancement.', capabilities: ['Suivi projets', 'Rapports', 'Jalons', 'Alertes'], tone: 'Professionnel', personality: 'Organisé et fiable.' },
      { name: 'Clara', role: 'Gestionnaire CRM', designation: 'SPEC-02', description: 'Gère votre pipeline commercial et automatise les relances.', capabilities: ['Pipeline', 'Relances', 'Devis', 'Contrats'], tone: 'Chaleureux', personality: 'Orientée relation client.' },
      { name: 'Raphaël', role: 'Analyste Performance', designation: 'SPEC-03', description: 'Analyse vos métriques clés et produit des rapports.', capabilities: ['Métriques', 'Rapports', 'ROI', 'Dashboards'], tone: 'Analytique', personality: 'Précis et orienté data.' },
    ],
  };

  return defaults[businessType] || [
    { name: 'Alex', role: 'Chef des Opérations', designation: 'SPEC-01', description: `Coordonne vos opérations et ${goalText.toLowerCase() || 'optimise votre productivité'}.`, capabilities: ['Coordination', 'Automatisation', 'Rapports', 'Alertes'], tone: 'Professionnel', personality: 'Stratégique et proactif.' },
    { name: 'Marie', role: 'Gestionnaire Relations', designation: 'SPEC-02', description: 'Gère vos communications et suit vos clients.', capabilities: ['CRM', 'Emails', 'Suivi', 'Relances'], tone: 'Chaleureux', personality: 'Empathique et réactive.' },
    { name: 'Lucas', role: 'Analyste Data', designation: 'SPEC-03', description: 'Analyse vos données et génère des insights actionnables.', capabilities: ['Analytics', 'Rapports', 'KPIs', 'Tendances'], tone: 'Analytique', personality: 'Méthodique et orienté résultats.' },
  ];
}
