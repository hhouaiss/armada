/**
 * request_approval — Human-in-the-Loop Gate
 *
 * Agents use this tool before executing high-risk actions.
 * Creates an ApprovalRequest in the DB, optionally sends a Telegram notification,
 * then polls until approved/rejected (or times out after 24h).
 *
 * Risk levels:
 *   low      — informational, auto-approved after 1h if no response
 *   medium   — standard review, waits up to 24h
 *   high     — requires explicit approval, blocks indefinitely
 *   critical — urgent alert, uses Telegram with prominent formatting
 */

import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { prisma } from '../lib/database.js';
import { nanoid } from 'nanoid';

// Injected from index.ts after Telegram is initialized
let telegramNotifier: ((storeId: string, text: string, hasButtons: boolean) => Promise<void>) | null = null;

export function setApprovalTelegramNotifier(
  fn: (storeId: string, text: string, hasButtons: boolean) => Promise<void>
) {
  telegramNotifier = fn;
}

const POLL_INTERVAL_MS = 5_000;  // Poll DB every 5s
const LOW_RISK_AUTO_APPROVE_MS = 60 * 60 * 1000; // 1h auto-approve for low risk
const MAX_WAIT_MS = 24 * 60 * 60 * 1000; // 24h max wait

export const requestApprovalTool: AgentTool = {
  name: 'request_approval',
  description:
    'Request human approval before executing a sensitive or high-impact action. ' +
    'Use this BEFORE performing: price changes, launching marketing campaigns, deleting content, ' +
    'sending emails to customers, modifying store settings, or any action with significant business impact. ' +
    'The human will be notified via Telegram and the Mission Control dashboard. ' +
    'Provide a clear description of what you want to do and why.',
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
    const { action, description, riskLevel, payload } = params;

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

    // For low-risk: auto-approve after 1h if no decision
    if (riskLevel === 'low') {
      return {
        success: true,
        data: {
          approvalId: approval.id,
          status: 'pending',
          message:
            `Demande d'approbation créée (risque faible). ` +
            `Si aucune décision dans 1h, l'action sera auto-approuvée. ` +
            `Vous pouvez continuer avec d'autres tâches en attendant.`,
        },
      };
    }

    // For medium/high/critical: poll until decision or timeout
    const maxWait = riskLevel === 'critical' ? 2 * 60 * 60 * 1000 : MAX_WAIT_MS; // 2h for critical
    const deadline = Date.now() + maxWait;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const updated = await prisma.approvalRequest
        .findUnique({ where: { id: approval.id } })
        .catch(() => null);

      if (!updated) break;

      if (updated.status === 'approved') {
        return {
          success: true,
          data: {
            approvalId: approval.id,
            status: 'approved',
            message: `Action approuvée par l'humain. Vous pouvez procéder avec: ${action}`,
          },
        };
      }

      if (updated.status === 'rejected') {
        return {
          success: false,
          error: `Action refusée par l'humain: ${action}. Ne pas exécuter cette action.`,
          data: { approvalId: approval.id, status: 'rejected' },
        };
      }
    }

    // Timeout
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: 'expired' },
    }).catch(() => {});

    return {
      success: false,
      error:
        `Délai d'approbation dépassé pour: ${action}. ` +
        `Action annulée. Le propriétaire peut la revalider depuis Mission Control.`,
      data: { approvalId: approval.id, status: 'expired' },
    };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
