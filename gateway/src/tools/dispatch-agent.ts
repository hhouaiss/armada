import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { MemoryEngine } from '../lib/memory-engine.js';
import { runInBackground } from '../lib/async-dispatch.js';
import { askJev, finishCall, type ChoiceAnswer, type Question } from '../lib/typesafe.js';
import type { BaseAgent } from '../agents/base-agent.js';

export const dispatchToSpecialistTool: AgentTool = {
  name: 'dispatch_to_specialist',
  description:
    'Delegate a task to any specialist agent in the squad by name. ' +
    'The squad is dynamic — use manage_agents with action "list" to see who is available. ' +
    'Provide the exact agent name (e.g. "Zoe", "Marcus", "Olivia") and a clear, self-contained task description. ' +
    'Choose the mode carefully: "sync" for a quick answer you need in this turn, "async" for any real deliverable ' +
    '(full email, report, audit) — async returns immediately and the result is pushed to the merchant when ready.',
  category: 'orchestration',
  // Runs a full nested agentic loop: a specialist producing a long deliverable
  // (full HTML email, report) takes minutes, well past the default 60s.
  timeoutMs: 10 * 60_000,
  inputSchema: {
    type: 'object',
    properties: {
      specialist: {
        type: 'string',
        description: 'The name of the specialist to delegate to (e.g. "Zoe", "Marcus", "Sarah"). Case-insensitive. Prefer the exact name; a close spelling or role is resolved against the squad when unambiguous. Use manage_agents list to see the current squad.',
      },
      task: {
        type: 'string',
        description: 'Clear, self-contained task description for the specialist. Include all relevant context they need.',
      },
      mode: {
        type: 'string',
        enum: ['sync', 'async'],
        description:
          'sync (default): wait for the specialist and return their answer in this turn. Only for short tasks (< 1 min) — a question, a few subject lines, a quick check. ' +
          'async: acknowledge immediately and let the specialist work in the background; the result is saved and pushed to the merchant when done. ' +
          'Use async for anything that produces a real deliverable (full HTML email, report, audit, long copy) — sync would time out.',
      },
    },
    required: ['specialist', 'task'],
  },

  async execute(
    params: { specialist: string; task: string; mode?: 'sync' | 'async' },
    context: ToolContext
  ): Promise<ToolResult> {
    const { specialist: requested, task } = params;

    if (!context.router) {
      return { success: false, error: 'Router not available — cannot dispatch to specialist.' };
    }

    const squad = context.router
      .getAgentsByStore(context.storeId)
      .filter(a => a.config.type !== 'major');
    const exact = squad.find(a => a.config.name.toLowerCase() === requested.toLowerCase());
    const review = squad.length > 0
      ? await reviewDispatch({ requested, task, mode: params.mode ?? 'sync', squad, exact, storeId: context.storeId })
      : undefined;
    const agent = exact ?? review?.resolved;
    const mode = review?.mode ?? params.mode ?? 'sync';

    if (!agent) {
      const available = squad.map(a => a.config.name).join(', ');
      return {
        success: false,
        error: `Specialist "${requested}" not found in this store's squad. Available: ${available || 'none'}. Use manage_agents with action "list" to see the full team.`,
      };
    }
    const resolvedFrom = agent.config.name.toLowerCase() === requested.toLowerCase() ? undefined : requested;
    const specialist = agent.config.name;

    console.log(`\n📡 Major dispatching to ${specialist} (${agent.config.type}, ${mode}): "${task.substring(0, 60)}..."`);

    // ── Detect future scheduling intent ─────────────────────────────────────
    // If the task mentions a date or "tomorrow/demain", extract it and write
    // to the agent's inbox so they remember even in fresh conversations.
    const scheduledDate = extractScheduledDate(task);
    const isFutureTask = scheduledDate !== null;

    const engine = new MemoryEngine(context.storeId);

    if (isFutureTask && mode === 'sync') {
      // Write to inbox BEFORE dispatch — agent will see it the next time they chat
      await engine.addToInbox(agent.config.id, {
        task,
        from: 'Major',
        scheduledDate: scheduledDate ?? undefined,
      });
      console.log(`  📥 Task written to ${specialist}'s inbox (scheduled: ${scheduledDate})`);

      // Still run the agent right now so they can acknowledge / plan
    }

    const subConversationId = `major-dispatch-${context.operationId}-${specialist.toLowerCase()}`;
    const subContext = { ...context, agentId: agent.config.id };

    // ── Async: hand off and return straight away ────────────────────────────
    // The tool call must not stay open for a multi-minute deliverable — the
    // result is persisted to the inbox and pushed when it lands.
    if (mode === 'async') {
      const taskId = await engine.addToInbox(agent.config.id, {
        task,
        from: 'Major',
        scheduledDate: scheduledDate ?? undefined,
        status: 'in_progress',
      });

      runInBackground({ agent, task, context: subContext, conversationId: subConversationId, taskId });

      return {
        success: true,
        data: {
          specialist,
          ...(resolvedFrom && { resolvedFrom }),
          ...(review?.modeUpgraded && {
            modeNote: 'Mode passé de sync à async : la tâche ressemble à un vrai livrable.',
          }),
          ...(review?.advice && { routingAdvice: review.advice }),
          mode: 'async',
          taskId,
          status: 'in_progress',
          note:
            `${specialist} a démarré la tâche en arrière-plan. Le résultat sera livré au marchand dès qu'il est prêt. ` +
            `N'attends pas le résultat et ne relance pas le dispatch — annonce simplement que ${specialist} s'en occupe.`,
        },
      };
    }

    // ── Sync: wait for the specialist ───────────────────────────────────────
    const { response, review: quality, initialReview, corrected } =
      await agent.chatWithQualityControl(task, subContext, subConversationId);

    // If not a future task, write to inbox AFTER successful execution
    // (so the agent remembers what they committed to in this dispatch)
    if (!isFutureTask) {
      await engine.addToInbox(agent.config.id, {
        task,
        from: 'Major',
      });
    }

    return {
      success: true,
      data: {
        specialist,
        ...(resolvedFrom && { resolvedFrom }),
        ...(review?.advice && { routingAdvice: review.advice }),
        ...(quality && {
          qualityCheck: {
            rating: quality.rating,
            score: Number(quality.quality.toFixed(2)),
            ...(corrected && {
              correctedAfterReview: true,
              initialIssues: initialReview?.flags,
            }),
            ...(quality.warning && {
              warning: `${quality.warning} Vérifie ce résultat avant de le transmettre au marchand : corrige-le, redemande à ${specialist} en précisant, ou signale la limite.`,
            }),
          },
        }),
        response,
      },
    };
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NAME_MIN_CONFIDENCE = Number(process.env.TYPESAFE_DISPATCH_MIN_CONFIDENCE ?? 0.6);
const MODE_UPGRADE_CONFIDENCE = 0.7;
const MISROUTE_CONFIDENCE = 0.8;

interface DispatchReview {
  resolved?: BaseAgent;
  mode?: 'sync' | 'async';
  modeUpgraded?: boolean;
  advice?: string;
}

/**
 * One Jev request per dispatch, answering independent questions in parallel:
 * which member was meant (only when the name isn't exact), who is best suited,
 * and whether the task is a quick answer or a real deliverable.
 * Any failure returns an empty review and the dispatch proceeds unchanged.
 */
async function reviewDispatch(args: {
  requested: string;
  task: string;
  mode: 'sync' | 'async';
  squad: BaseAgent[];
  exact?: BaseAgent;
  storeId: string;
}): Promise<DispatchReview> {
  const { requested, task, squad, exact, storeId } = args;
  const roster: Record<string, string> = {};
  squad.forEach((a, i) => {
    const about = (a.config.personality || a.config.systemPrompt || '').replace(/\s+/g, ' ').slice(0, 280);
    roster[`agent_${i}`] = `${a.config.name} — ${a.config.type} specialist.${about ? ` ${about}` : ''}`;
  });
  const names = Object.fromEntries(squad.map((a, i) => [`agent_${i}`, a.config.name]));

  const questions: Record<string, Question> = {
    effort: {
      type: 'choice',
      instructions: 'How much work does `task` ask the specialist to produce?',
      criteria: {
        quick: 'A quick answer: a question, a check, a short list or a few lines, doable in under a minute.',
        deliverable: 'A real deliverable: a full email, report, audit, article, long copy or multi-step work taking several minutes.',
      },
    },
  };
  if (squad.length > 1) {
    questions.best_fit = {
      type: 'choice',
      instructions: 'Ignoring who was requested, which squad member is best suited to carry out `task`?',
      criteria: { ...roster, none: 'No squad member is suited to this task.' },
    };
  }
  if (!exact) {
    questions.named = {
      type: 'choice',
      instructions:
        'The orchestrator asked to delegate `task` to `requested_specialist`, which is not an exact squad member name. ' +
        'It may be a misspelling, a nickname, a role ("the SEO person") or an agent type. Which squad member did the orchestrator mean? ' +
        'Rely on the requested name first and use the task only to break ties.',
      criteria: {
        ...roster,
        none: 'None: the requested name refers to someone not in the squad.',
      },
    };
  }

  const result = await askJev({ requested_specialist: requested, task: task.slice(0, 2000) }, questions, {
    storeId,
    feature: 'dispatch',
    agentName: exact?.config.name,
    requestedValue: requested,
    taskPreview: task,
    labels: { best_fit: names, named: names },
  });
  if (!result.ok || !result.answers) {
    await finishCall(result.callId, { outcomes: ['fallback_error'] });
    return {};
  }

  const outcomes: string[] = [];
  const review: DispatchReview = {};
  const pick = (id: string) => result.answers![id] as ChoiceAnswer | undefined;

  let chosen = exact;
  const named = pick('named');
  if (named) {
    const candidate = squad[Number(named.choice.replace('agent_', ''))];
    if (named.choice === 'none' || !candidate) outcomes.push('name_no_match');
    else if (named.confidence < NAME_MIN_CONFIDENCE) outcomes.push('name_low_confidence');
    else {
      outcomes.push('name_resolved');
      review.resolved = chosen = candidate;
      console.log(`  🧭 Jev resolved "${requested}" → ${candidate.config.name} (${named.confidence.toFixed(2)})`);
    }
  }

  const effort = pick('effort');
  if (effort) {
    if (args.mode === 'sync' && effort.choice === 'deliverable' && effort.confidence >= MODE_UPGRADE_CONFIDENCE) {
      review.mode = 'async';
      review.modeUpgraded = true;
      outcomes.push('mode_upgraded');
      console.log(`  ⏩ Jev upgraded dispatch to async (deliverable, ${effort.confidence.toFixed(2)})`);
    } else {
      outcomes.push('mode_kept');
    }
  }

  const fit = pick('best_fit');
  if (fit && chosen) {
    const chosenKey = `agent_${squad.indexOf(chosen)}`;
    const better = squad[Number(fit.choice.replace('agent_', ''))];
    if (
      better && fit.choice !== chosenKey &&
      fit.confidence >= MISROUTE_CONFIDENCE &&
      (fit.probabilities[chosenKey] ?? 0) < 0.1
    ) {
      outcomes.push('misroute_flagged');
      review.advice =
        `Cette tâche semble mieux correspondre à ${better.config.name} (${better.config.type}) qu'à ${chosen.config.name}. ` +
        `Vérifie le résultat et redélègue à ${better.config.name} si besoin.`;
    } else {
      outcomes.push('fit_ok');
    }
  }

  await finishCall(result.callId, {
    outcomes,
    resolvedValue: chosen?.config.name,
    confidence: named?.confidence ?? fit?.confidence ?? effort?.confidence,
  });
  return review;
}

/**
 * Tries to detect a scheduled date from the task description.
 * Returns a YYYY-MM-DD string or null if no date intent is found.
 */
function extractScheduledDate(task: string): string | null {
  const lower = task.toLowerCase();
  const today = new Date();

  // "tomorrow" / "demain"
  if (/\bdemain\b|\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  // "in X days" / "dans X jours"
  const daysMatch = lower.match(/\bdans\s+(\d+)\s+jours?\b|\bin\s+(\d+)\s+days?\b/);
  if (daysMatch) {
    const n = parseInt(daysMatch[1] ?? daysMatch[2], 10);
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // Explicit date patterns: "le 20 avril", "on April 20", "2026-04-20"
  const isoMatch = task.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  return null;
}
