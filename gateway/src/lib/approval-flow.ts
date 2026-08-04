/**
 * Approval Flow — unified human-in-the-loop gate
 *
 * When an agent calls a tool flagged `requiresApproval`, the exact tool call
 * (name + params) is stored in an ApprovalRequest row (payload.__execute).
 * Approving from ANY channel — Mission Control (PATCH /api/approvals),
 * Telegram (inline buttons or /approve_xxx), or the chat ("oui") — flips the
 * status to 'approved'; the executor then runs the stored call automatically
 * and reports the result to the chat and Telegram.
 *
 * Status lifecycle: pending → approved → executing → executed | failed
 *                   pending → rejected | expired
 */

import { Router } from '../core/router.js';
import { ToolRegistry } from '../core/tool-registry.js';
import { SessionManager } from '../core/session-manager.js';
import { ToolResult } from '../types/operations.js';
import { prisma, getStoreCredentials, saveChatMessage } from './database.js';
import { decryptToken } from './shopify-client.js';

export interface ApprovalDeps {
  toolRegistry: ToolRegistry;
  router?: Router;
  sessionManager?: SessionManager;
}

// ── Telegram notifiers (wired from index.ts after Telegram init) ─────────────
let actionNotifier:
  | ((storeId: string, approvalId: string, text: string) => Promise<void>)
  | null = null;
let resultNotifier: ((storeId: string, text: string) => Promise<void>) | null = null;

export function setApprovalActionNotifier(
  fn: (storeId: string, approvalId: string, text: string) => Promise<void>
) {
  actionNotifier = fn;
}

export function setApprovalResultNotifier(fn: (storeId: string, text: string) => Promise<void>) {
  resultNotifier = fn;
}

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

/** Short human-readable label for an approval card. */
function describeToolCall(toolName: string, params: Record<string, any>): string {
  const label =
    params.title ?? params.name ?? params.handle ?? params.productTitle ?? null;
  return label ? `${toolName} — « ${label} »` : toolName;
}

/**
 * Create a DB-backed approval request holding the exact tool call to run.
 * Notifies Telegram with approve/reject buttons if wired.
 */
export async function createExecutableApproval(input: {
  storeId: string;
  agentId: string;
  agentName: string;
  toolName: string;
  params: Record<string, any>;
  conversationId: string;
  description?: string;
}) {
  const approval = await prisma.approvalRequest.create({
    data: {
      storeId: input.storeId,
      agentId: input.agentId,
      agentName: input.agentName,
      action: input.toolName,
      description:
        input.description ?? describeToolCall(input.toolName, input.params),
      payload: {
        __execute: true,
        toolName: input.toolName,
        params: input.params,
        conversationId: input.conversationId,
      },
      riskLevel: 'medium',
      status: 'pending',
      expiresAt: new Date(Date.now() + EXPIRY_MS),
    },
  });

  const shortId = approval.id.slice(-8);
  const text =
    `🔐 *Approbation requise*\n\n` +
    `*Agent :* ${input.agentName}\n` +
    `*Action :* \`${input.toolName}\`\n\n` +
    `${approval.description}\n\n` +
    `Approuvez avec les boutons ci-dessous, depuis *Mission Control* (onglet Approbations), ` +
    `ou avec /approve\\_${shortId} — /reject\\_${shortId}`;

  if (actionNotifier) {
    await actionNotifier(input.storeId, approval.id, text).catch((e) =>
      console.warn('Approval Telegram notification failed:', e)
    );
  }

  console.log(`  🔐 Approval created: ${input.toolName} — ID ${approval.id}`);
  return approval;
}

/**
 * Claim and execute an approval's stored tool call.
 * `claimFrom` guards against double execution: the row is atomically moved
 * from that status to 'executing' before running.
 * Returns null if the row was already claimed by someone else.
 */
export async function executeApproval(
  approvalId: string,
  deps: ApprovalDeps,
  options: { claimFrom: 'approved' | 'pending'; postChatMessage?: boolean; decidedBy?: string }
): Promise<ToolResult | null> {
  const claimed = await prisma.approvalRequest.updateMany({
    where: { id: approvalId, status: options.claimFrom },
    data: {
      status: 'executing',
      decidedAt: new Date(),
      ...(options.decidedBy ? { decidedBy: options.decidedBy } : {}),
    },
  });
  if (claimed.count !== 1) return null;

  const approval = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
  if (!approval) return null;

  const payload = approval.payload as {
    __execute?: boolean;
    toolName?: string;
    params?: Record<string, any>;
    conversationId?: string;
  };

  if (!payload?.__execute || !payload.toolName) {
    // Informational approval (request_approval tool) — nothing to run
    await prisma.approvalRequest.update({
      where: { id: approvalId },
      data: { status: 'approved' },
    });
    return null;
  }

  let result: ToolResult;
  try {
    const store = await getStoreCredentials(approval.storeId);
    const accessToken = decryptToken(store.accessToken);
    const context = {
      storeId: approval.storeId,
      shopifyAccessToken: accessToken,
      shopifyDomain: store.shopifyDomain,
      agentId: approval.agentId ?? 'system',
      operationId: `approval-${approval.id}`,
      router: deps.router,
      toolRegistry: deps.toolRegistry,
      sessionManager: deps.sessionManager,
    };

    result = await deps.toolRegistry.execute(payload.toolName, payload.params ?? {}, context);
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.approvalRequest
    .update({
      where: { id: approvalId },
      data: { status: result.success ? 'executed' : 'failed' },
    })
    .catch(() => {});

  console.log(
    `  ${result.success ? '✅' : '✗'} Approval ${approvalId} executed: ${payload.toolName} — ${
      result.success ? 'ok' : result.error
    }`
  );

  const summary = result.success
    ? `✅ Action approuvée et exécutée : ${approval.description}`
    : `✗ L'action approuvée a échoué : ${approval.description}\nErreur : ${result.error}`;

  if (options.postChatMessage !== false) {
    if (approval.agentId) {
      await saveChatMessage({
        storeId: approval.storeId,
        agentId: approval.agentId,
        sender: 'agent',
        content: summary,
      }).catch(() => {});
    }
    if (resultNotifier) {
      await resultNotifier(approval.storeId, summary).catch(() => {});
    }
  }

  return result;
}

/** Latest pending executable approval created from a given conversation. */
export async function findPendingApprovalForConversation(
  storeId: string,
  conversationId: string
) {
  return prisma.approvalRequest.findFirst({
    where: {
      storeId,
      status: 'pending',
      payload: { path: ['conversationId'], equals: conversationId },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Background executor: picks up rows approved from Mission Control or Telegram
 * (status 'approved') and runs their stored tool call. Checks every 5s.
 */
export function startApprovalExecutor(deps: ApprovalDeps): void {
  setInterval(async () => {
    try {
      const approved = await prisma.approvalRequest.findMany({
        where: {
          status: 'approved',
          payload: { path: ['__execute'], equals: true },
        },
        take: 10,
      });
      for (const approval of approved) {
        await executeApproval(approval.id, deps, { claimFrom: 'approved' });
      }
    } catch (error) {
      console.error('Approval executor error:', error);
    }
  }, 5_000);
  console.log('✓ Approval executor started (5s polling)');
}
