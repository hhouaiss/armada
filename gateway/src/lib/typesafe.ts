import { prisma } from './database.js';

const API_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const TIMEOUT_MS = 8_000;

export type Question =
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };

export interface ChoiceAnswer { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
export interface ScoreAnswer { type: 'score'; score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, string> }
export interface NoulAnswer { type: 'noul'; noul: number }
export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface CallLog {
  storeId: string;
  feature: string;
  agentName?: string;
  requestedValue?: string;
  taskPreview?: string;
  /** Per question: readable names for option keys, applied to the stored log only. */
  labels?: Record<string, Record<string, string>>;
}

export interface JevResult {
  ok: boolean;
  answers?: Record<string, Answer>;
  callId?: string;
  error?: string;
}

export async function askJev(state: unknown, questions: Record<string, Question>, log: CallLog): Promise<JevResult> {
  const started = Date.now();
  if (!process.env.TYPESAFE_API_KEY) {
    const callId = await record(log, { status: 'skipped', latencyMs: 0, error: 'TYPESAFE_API_KEY not set on gateway' });
    return { ok: false, error: 'TYPESAFE_API_KEY not set', callId };
  }
  let httpStatus: number | undefined;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    httpStatus = res.status;
    if (!res.ok) throw new Error(`TypeSafe HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const body = (await res.json()) as {
      model?: string;
      answers: Record<string, Answer>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const callId = await record(log, {
      status: 'ok',
      model: body.model ?? MODEL,
      latencyMs: Date.now() - started,
      httpStatus,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
      answers: labelAnswers(body.answers, log.labels),
    });
    return { ok: true, answers: body.answers, callId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const callId = await record(log, { status: 'error', latencyMs: Date.now() - started, httpStatus, error });
    return { ok: false, error, callId };
  }
}

export async function finishCall(
  callId: string | undefined,
  data: { outcomes: string[]; resolvedValue?: string; confidence?: number },
) {
  if (!callId) return;
  await prisma.typeSafeCall
    .update({ where: { id: callId }, data })
    .catch(e => console.warn('[typesafe] outcome log failed:', e));
}

function labelAnswers(answers: Record<string, Answer>, labels?: CallLog['labels']) {
  const out: Record<string, any> = {};
  for (const [id, a] of Object.entries(answers)) {
    const map = labels?.[id];
    if (!map || a.type !== 'choice') {
      out[id] = a;
      continue;
    }
    out[id] = {
      ...a,
      choice: map[a.choice] ?? a.choice,
      probabilities: Object.fromEntries(Object.entries(a.probabilities).map(([k, v]) => [map[k] ?? k, v])),
    };
  }
  return out;
}

interface CallData {
  status: 'ok' | 'error' | 'skipped';
  latencyMs: number;
  model?: string;
  httpStatus?: number;
  inputTokens?: number;
  outputTokens?: number;
  answers?: Record<string, any>;
  error?: string;
}

async function record(log: CallLog, data: CallData): Promise<string | undefined> {
  try {
    const row = await prisma.typeSafeCall.create({
      data: {
        storeId: log.storeId,
        feature: log.feature,
        agentName: log.agentName,
        requestedValue: log.requestedValue,
        taskPreview: log.taskPreview?.slice(0, 500),
        ...data,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    // Monitoring must never break the agent flow.
    console.warn('[typesafe] call log failed:', e);
    return undefined;
  }
}
