import type { Question } from './typesafe.js';
import type { LivrableEvidence } from './notion-livrables.js';

export interface ToolTraceEntry {
  tool: string;
  status: 'ok' | 'error' | 'approval_pending' | 'blocked';
  detail?: string;
}

export interface TurnInput {
  agentName: string;
  agentType: string;
  request: string;
  response: string;
  toolTrace: ToolTraceEntry[];
  /** Deliverables the agent produced this turn (Armada livrable block, Notion pages read back). */
  livrables?: LivrableEvidence[];
}

export const WEAKNESSES = {
  none: 'No notable weakness: the response does the job well.',
  incomplete: 'Leaves out part of what was asked, or stops before finishing the work.',
  unsupported_claims: 'States store figures, facts or completed actions that the tool results do not support.',
  too_generic: 'Generic advice or filler that is not tailored to this store, its data or the precise request.',
  ignored_tool_error: 'A tool failed or is awaiting approval, but the response presents the work as done.',
  wrong_language: 'Answers in a different language than the merchant used.',
  off_topic: 'Answers a different question than the one asked.',
} as const;

export type Weakness = keyof typeof WEAKNESSES;

export function buildReviewState(input: TurnInput) {
  return {
    agent: { name: input.agentName, role: input.agentType },
    request: input.request.slice(0, 3000),
    response: input.response.slice(0, 6000),
    tool_trace: input.toolTrace.slice(-20),
    ...(readable(input).length > 0 && {
      livrables: readable(input).map(l => ({ source: l.source, title: l.title, content: l.content })),
    }),
  };
}

const readable = (input: TurnInput) => (input.livrables ?? []).filter(l => l.content);

export function buildReviewQuestions(input: TurnInput): Record<string, Question> {
  const hasToolIssue = input.toolTrace.some(t => t.status !== 'ok');
  const hasLivrables = readable(input).length > 0;
  const work = hasLivrables ? '`response` together with the deliverables in `livrables`' : '`response`';
  const questions: Record<string, Question> = {
    completion: {
      type: 'score',
      instructions:
        `An AI agent working for a Shopify merchant received \`request\` and produced ${work}. How completely does that work accomplish what \`request\` asks for?`,
      criteria: [
        'Not addressed: the response does not do what was asked.',
        'Partial: only a small part of the request is handled.',
        'Mostly done: the main request is handled but something asked for is missing.',
        'Fully done: everything asked for is handled.',
      ],
    },
    specificity: {
      type: 'score',
      instructions: `How specific and actionable is ${work} for this merchant and this \`request\`?`,
      criteria: [
        'Generic: boilerplate that could apply to any store.',
        'Somewhat specific: partly tailored, with vague parts.',
        'Specific: concrete, tailored to the store and directly usable.',
      ],
    },
    unsupported_claims: {
      type: 'noul',
      instructions:
        'Does `response` state store data (numbers, products, orders, stock, customers) or claim actions were completed that are NOT supported by `tool_trace`? ' +
        'General advice, plans and content the agent wrote itself are not claims about store data.',
      criteria: {
        true: 'At least one stated fact, figure or completed action has no support in the tool results.',
        false: 'Every stated store fact or completed action is backed by the tool results, or none are stated.',
      },
    },
    language_mismatch: {
      type: 'noul',
      instructions:
        'Compare the natural language (French, English, Spanish…) of `request` with the natural language `response` is mainly written in. Are they different languages?',
      criteria: {
        true: 'Different languages, e.g. the merchant wrote in French and the agent answered in English.',
        false: 'Same language, e.g. both in French.',
      },
    },
    main_weakness: {
      type: 'choice',
      instructions: `What is the single most important weakness of ${work} as an answer to \`request\`?`,
      criteria: { ...WEAKNESSES },
    },
  };
  if (hasLivrables) {
    questions.livrable_quality = {
      type: 'score',
      instructions:
        'The agent saved the pages in `livrables` as its deliverable for `request`. How ready to use are they for the merchant?',
      criteria: [
        'Unusable: empty, broken, placeholder text or not what was asked.',
        'Rough draft: the right idea but needs substantial rework before use.',
        'Good draft: solid and relevant, needs minor edits.',
        'Ready to use: complete, polished and directly publishable or actionable.',
      ],
    };
  }
  if (hasToolIssue) {
    questions.tool_issue_disclosed = {
      type: 'noul',
      instructions:
        'Some tools in `tool_trace` failed or are awaiting human approval. Does `response` tell the merchant honestly what did not happen or is still pending?',
    };
  }
  return questions;
}
