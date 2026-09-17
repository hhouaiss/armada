/**
 * request_approval — Human-in-the-Loop Gate (informational)
 *
 * For high-impact actions NOT covered by gated tools (requiresApproval).
 * Creates an ApprovalRequest in the DB and notifies Telegram, then returns
 * immediately (non-blocking). Gated tools (article_create, product_create, …)
 * do not need this: base-agent creates an executable approval automatically —
 * see lib/approval-flow.ts.
 */

import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { prisma } from '../lib/database.js';
import { nanoid } from 'nanoid';
import { askJev, finishCall, type ScoreAnswer } from '../lib/typesafe.js';

// Injected from index.ts after Telegram is initialized
let telegramNotifier: ((storeId: string, text: string, hasButtons: boolean) => Promise<void>) | null = null;

export function setApprovalTelegramNotifier(
  fn: (storeId: string, text: string, hasButtons: boolean) => Promise<void>
) {
  telegramNotifier = fn;
}

const MAX_WAIT_MS = 24 * 60 * 60 * 1000; // 24h before the request expires

export const requestApprovalTool: AgentTool = {
  name: 'request_approval',
  description:
    'Request human approval for a high-impact action that is NOT covered by a gated tool. ' +
    'IMPORTANT: do NOT use this before tools that already require approval ' +
    '(product_create, product_update, article_create, article_update, blog_create, inventory_update, etc.) — ' +
    'those tools create their own approval request automatically when called; just call them directly. ' +
    'Use request_approval only for other sensitive actions: launching marketing campaigns, ' +
    'sending emails to customers, modifying store settings. ' +
    'The human is notified via Telegram and Mission Control.',
  category: 'orchestration',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Short action name (e.g., "launch_klaviyo_campaign", "update_product_price")',
      },
      description: {
        type: 'string',
        description:
          'Clear human-readable explanation of: what you want to do, why, and what the impact will be. Be specific.',
      },
      riskLevel: {
        type: 'string',
        description: 'Risk level: low (auto-approve after 1h), medium (wait 24h), high (urgent), critical (block)',
        enum: ['low', 'medium', 'high', 'critical'],
      },
      payload: {
        type: 'object',
        description: 'The exact parameters that will be used when the action is approved (for audit trail)',
        properties: {},
      },
    },
    required: ['action', 'description', 'riskLevel'],
  },

  async execute(
    params: {
      action: string;
      description: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      payload?: Record<string, any>;
    },
    context: ToolContext
  ): Promise<ToolResult> {
    const { action, payload } = params;
    const { riskLevel, description } = await reviewRisk(params, context);

    // Create approval request in DB
    const expiresAt = new Date(Date.now() + MAX_WAIT_MS);
    const approval = await prisma.approvalRequest.create({
      data: {
        storeId: context.storeId,
        agentId: context.agentId,
        agentName: context.agentId.split(':').pop() ?? 'Agent',
        action,
        description,
        payload: payload ?? {},
        riskLevel,
        status: 'pending',
        expiresAt,
      },
    });

    // Send Telegram notification
    const riskEmoji: Record<string, string> = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🔴',
      critical: '🚨',
    };

    const telegramMsg =
      `${riskEmoji[riskLevel] ?? '⚠️'} *Approbation requise*\n\n` +
      `*Action :* \`${action}\`\n` +
      `*Risque :* ${riskLevel.toUpperCase()}\n\n` +
      `${description}\n\n` +
      `Approuvez depuis *Mission Control* ou répondez ici avec /approve_${approval.id.slice(-8)} ou /reject_${approval.id.slice(-8)}`;

    if (telegramNotifier) {
      await telegramNotifier(context.storeId, telegramMsg, true).catch((e: any) =>
        console.warn('Approval Telegram notification failed:', e)
      );
    }

    console.log(`\n🔐 Approval requested: ${action} (${riskLevel}) — ID: ${approval.id}`);

    // Non-blocking: return immediately. The human decides from Mission Control
    // or Telegram; the agent must NOT execute the action in the meantime.
    // For short waits (< 2 min), the agent may poll with check_approval-style
    // reads, but the standard flow is: inform the user and end the turn.
    return {
      success: true,
      data: {
        approvalId: approval.id,
        status: 'pending',
        message:
          `Demande d'approbation créée (ID: ${approval.id}, risque ${riskLevel}). ` +
          `N'exécute PAS l'action tant qu'elle n'est pas approuvée. ` +
          `Informe l'utilisateur qu'il peut approuver depuis Mission Control (onglet Approbations) ou Telegram, ` +
          `puis termine ton tour. Il te redemandera l'exécution une fois approuvée si nécessaire.`,
      },
    };
  },
};

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];
const RISK_RAISE_CONFIDENCE = 0.5;

/**
 * Independent Jev risk assessment. The agent's own level is a floor: Jev can
 * raise it, never lower it. Any failure keeps the agent's values.
 */
async function reviewRisk(
  params: { action: string; description: string; riskLevel: RiskLevel; payload?: Record<string, any> },
  context: ToolContext,
): Promise<{ riskLevel: RiskLevel; description: string }> {
  const claimed = params.riskLevel;
  const result = await askJev(
    {
      action: params.action,
      description: params.description.slice(0, 3000),
      payload: JSON.stringify(params.payload ?? {}).slice(0, 2000),
      context: 'A Shopify merchant\'s AI agent wants to perform this action on the live store or its marketing channels.',
    },
    {
      risk: {
        type: 'score',
        instructions:
          'How risky is performing `action` as described for the merchant\'s business? Consider money, customers reached, reversibility and brand impact.',
        criteria: [
          'Low: internal or easily reversible, no customer sees it, no money at stake.',
          'Medium: visible to some customers or a moderate, reversible change (e.g. a draft, a small segment, one product).',
          'High: reaches many customers or moves money, hard to undo (e.g. an email blast, store-wide price or settings change).',
          'Critical: irreversible or potentially very damaging (e.g. deleting data, mass refunds, sending to the whole customer base with wrong content).',
        ],
      },
    },
    {
      storeId: context.storeId,
      feature: 'approval_risk',
      agentName: context.agentId.split(':').pop(),
      requestedValue: claimed,
      taskPreview: `${params.action} — ${params.description}`,
    },
  );

  const answer = result.answers?.risk as ScoreAnswer | undefined;
  if (!result.ok || !answer) {
    await finishCall(result.callId, { outcomes: ['fallback_error'], resolvedValue: claimed });
    return { riskLevel: claimed, description: params.description };
  }

  const jevLevel = RISK_LEVELS[Math.min(3, Math.max(0, Math.round(answer.score)))];
  const claimedIdx = RISK_LEVELS.indexOf(claimed);
  const jevIdx = RISK_LEVELS.indexOf(jevLevel);
  let outcome = 'risk_agreed';
  let final: RiskLevel = claimed;
  if (jevIdx > claimedIdx && answer.confidence >= RISK_RAISE_CONFIDENCE) {
    outcome = 'risk_raised';
    final = jevLevel;
  } else if (jevIdx > claimedIdx) {
    outcome = 'risk_higher_uncertain';
  } else if (jevIdx < claimedIdx) {
    outcome = 'risk_lower_than_claimed';
  }
  await finishCall(result.callId, { outcomes: [outcome], resolvedValue: final, confidence: answer.confidence });

  if (final === claimed) return { riskLevel: claimed, description: params.description };
  console.log(`  🛡️ Jev raised approval risk ${claimed} → ${final} (${answer.confidence.toFixed(2)})`);
  return {
    riskLevel: final,
    description: `${params.description}\n\n[Risque réévalué : ${claimed} → ${final} par vérification indépendante]`,
  };
}

