/**
 * Gemini Live Bridge — port 18795
 *
 * Bridges browser ↔ Gemini 3.1 Flash Live WebSocket without touching the
 * existing gateway WS on port 18790.
 *
 * Flow:
 *   Browser audio (PCM16 16kHz) → Gemini Live (= Le Major, system prompt injecté)
 *   Gemini génère la réponse directement (~400ms) — pas de hop Kimi
 *   Si outil nécessaire → toolRegistry.execute() direct
 *   Gemini audio (PCM16 24kHz) → Browser
 */

import { WebSocketServer, WebSocket as WS } from 'ws';
import WebSocket from 'ws';
import { Router } from './router.js';
import { ToolRegistry } from './tool-registry.js';
import { SessionManager } from './session-manager.js';
import { getStoreCredentials } from '../lib/database.js';
import { decryptToken } from '../lib/shopify-client.js';
import { MAJOR_SYSTEM_PROMPT } from '../agents/major-agent.js';

const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

// Tools Gemini can call directly — no second LLM involved
const VOICE_TOOLS = [
  {
    name: 'list_orders',
    description: 'Récupère les dernières commandes du magasin.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Nombre de commandes (défaut: 10)' },
        status: { type: 'string', description: 'Filtre: any, open, closed, cancelled' },
      },
    },
  },
  {
    name: 'get_low_stock',
    description: 'Liste les produits avec un stock faible ou en rupture.',
    parameters: {
      type: 'object',
      properties: { threshold: { type: 'number', description: 'Seuil de stock faible (défaut: 10)' } },
    },
  },
  {
    name: 'list_products',
    description: 'Liste les produits du catalogue.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        query: { type: 'string', description: 'Recherche par nom de produit' },
      },
    },
  },
  {
    name: 'get_store_info',
    description: 'Informations générales sur le magasin.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_customers',
    description: 'Liste les clients du magasin.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
];

export function startGeminiLiveBridge(
  port: number,
  router: Router,
  toolRegistry: ToolRegistry,
  sessionManager: SessionManager
): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (clientWs: WS) => {
    let geminiWs: WebSocket | null = null;
    let storeId: string | null = null;
    let agentId: string | null = null;
    let isReady = false;

    // Audio buffer: collect chunks per Gemini turn before playback
    const audioChunks: string[] = [];

    const sendToClient = (msg: object) => {
      if (clientWs.readyState === WS.OPEN) {
        clientWs.send(JSON.stringify(msg));
      }
    };

    clientWs.on('message', async (rawData) => {
      let msg: any;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      // ── INIT: open Gemini Live session ──────────────────────────────────
      if (msg.type === 'init') {
        storeId = msg.storeId;
        agentId = msg.agentId;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          sendToClient({ type: 'error', message: 'GEMINI_API_KEY manquante côté gateway' });
          return;
        }

        geminiWs = new WebSocket(`${GEMINI_LIVE_URL}?key=${apiKey}`);

        geminiWs.on('open', () => {
          // Gemini IS The Major — no second LLM hop
          geminiWs!.send(JSON.stringify({
            setup: {
              model: LIVE_MODEL,
              generation_config: {
                response_modalities: ['AUDIO'],
                speech_config: {
                  voice_config: {
                    prebuilt_voice_config: { voice_name: 'Puck' },
                  },
                },
              },
              system_instruction: {
                parts: [{
                  text: MAJOR_SYSTEM_PROMPT +
                    '\n\n## MODE VOCAL\nTu réponds oralement. Sois bref et direct — 1 à 3 phrases maximum sauf si on te demande un rapport. Pas de markdown, pas de tirets, parle naturellement.',
                }],
              },
              tools: [{ function_declarations: VOICE_TOOLS }],
            },
          }));
        });

        // ── Messages from Gemini → client ──────────────────────────────────
        geminiWs.on('message', async (data) => {
          let response: any;
          const raw = data.toString();
          try {
            response = JSON.parse(raw);
          } catch {
            console.log('[Gemini Bridge] Non-JSON from Gemini:', raw.slice(0, 200));
            return;
          }

          // Log everything except audio chunks
          if (!response.serverContent?.modelTurn) {
            console.log('[Gemini Bridge] ← Gemini:', JSON.stringify(response).slice(0, 300));
          }

          // API-level error
          if (response.error) {
            console.error('[Gemini Bridge] Gemini API error:', response.error);
            sendToClient({ type: 'error', message: `Gemini: ${response.error.message || JSON.stringify(response.error)}` });
            return;
          }

          // Setup confirmed
          if (response.setupComplete !== undefined) {
            isReady = true;
            sendToClient({ type: 'ready' });
            return;
          }

          // Audio chunks → buffer, flush on turn complete
          if (response.serverContent?.modelTurn?.parts) {
            for (const part of response.serverContent.modelTurn.parts) {
              if (part.inlineData?.mimeType?.startsWith('audio/')) {
                audioChunks.push(part.inlineData.data);
              }
            }
          }

          // Turn complete → flush audio buffer to client
          if (response.serverContent?.turnComplete) {
            if (audioChunks.length > 0) {
              sendToClient({
                type: 'audio_turn',
                chunks: [...audioChunks],
                mimeType: 'audio/pcm;rate=24000',
              });
              audioChunks.length = 0;
            }
            sendToClient({ type: 'turn_complete' });
          }

          // Input transcription → show what user said
          if (response.serverContent?.inputTranscription?.text) {
            sendToClient({
              type: 'transcript',
              text: response.serverContent.inputTranscription.text,
            });
          }

          // Output transcription → show what Major said
          if (response.serverContent?.outputTranscription?.text) {
            sendToClient({
              type: 'response_text',
              text: response.serverContent.outputTranscription.text,
            });
          }

          // Tool calls: execute Shopify tools directly, no LLM hop
          if (response.toolCall?.functionCalls?.length) {
            const functionResponses: any[] = [];

            for (const call of response.toolCall.functionCalls) {
              let result: any = { error: 'Outil indisponible' };
              try {
                if (!storeId) throw new Error('storeId manquant');
                const store = await getStoreCredentials(storeId);
                const context = {
                  storeId,
                  shopifyAccessToken: decryptToken(store.accessToken),
                  shopifyDomain: store.shopifyDomain,
                  agentId: agentId || 'voice',
                  operationId: `voice-${Date.now()}`,
                  channel: 'web' as const,
                  router,
                  toolRegistry,
                  sessionManager,
                };
                console.log(`[Gemini Bridge] → tool: ${call.name}`, call.args);
                const toolResult = await toolRegistry.execute(call.name, call.args || {}, context);
                result = toolResult.success ? toolResult.data : { error: toolResult.error };
                console.log(`[Gemini Bridge] ← tool: ${call.name} OK`);
              } catch (err: any) {
                console.error(`[Gemini Bridge] tool ${call.name} failed:`, err.message);
                result = { error: err.message };
              }
              functionResponses.push({ id: call.id, name: call.name, response: result });
            }

            geminiWs!.send(JSON.stringify({
              toolResponse: { functionResponses },
            }));
          }
        });

        geminiWs.on('close', () => {
          isReady = false;
          sendToClient({ type: 'disconnected' });
        });

        geminiWs.on('error', (err) => {
          console.error('[Gemini Bridge] Gemini WS error:', err.message);
          sendToClient({ type: 'error', message: 'Connexion Gemini échouée' });
        });

        return;
      }

      // ── AUDIO: browser PCM → Gemini ─────────────────────────────────────
      if (msg.type === 'audio' && geminiWs?.readyState === WebSocket.OPEN && isReady) {
        geminiWs.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          },
        }));
      }
    });

    clientWs.on('close', () => {
      geminiWs?.close();
    });
  });

  console.log(`[Gemini Live Bridge] Listening on ws://localhost:${port}`);
  return wss;
}
