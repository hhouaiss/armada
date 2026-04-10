import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { MemoryEngine } from '../lib/memory-engine.js';

/**
 * memory_read — Charge un topic file complet à la demande.
 * L'agent appelle cet outil quand il a besoin du détail d'un sujet
 * mentionné dans l'index mémoire (ex: 'ventes/strategy').
 */
export const memoryReadTool: AgentTool = {
  name: 'memory_read',
  description:
    'Charge un fichier de mémoire (topic file) par sa clé. ' +
    'Utilise cet outil quand l\'index mémoire mentionne un topic dont tu as besoin du détail. ' +
    'Exemple: memory_read({ key: "ventes/strategy" })',
  // No category = visible to ALL agents regardless of scope
  category: 'memory',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Clé du topic file, ex: "ventes/strategy", "finance/cashflow", "support/faq"',
      },
    },
    required: ['key'],
  },

  validate(params: any) {
    if (!params.key || typeof params.key !== 'string') {
      return { valid: false, errors: ['key is required and must be a string'] };
    }
    return { valid: true };
  },

  async execute(params: { key: string }, context: ToolContext): Promise<ToolResult> {
    const engine = new MemoryEngine(context.storeId);
    const content = await engine.loadTopicFile(params.key);

    if (!content) {
      return {
        success: true,
        data: { found: false, key: params.key, message: `Aucun topic file trouvé pour la clé "${params.key}".` },
      };
    }

    return {
      success: true,
      data: { found: true, key: params.key, content },
    };
  },
};

/**
 * memory_write — Écrit ou met à jour un élément de mémoire.
 * Supporte 3 types d'opérations:
 *   - 'decision'  → ajoute une décision datée à l'index
 *   - 'fact'      → ajoute/retire un fait clé dans l'index
 *   - 'topic'     → écrit/met à jour un topic file complet
 */
export const memoryWriteTool: AgentTool = {
  name: 'memory_write',
  description:
    'Mémorise une information importante pour les prochaines sessions. ' +
    'Types: "decision" (décision datée), "fact" (fait clé bref), "topic" (document détaillé sur un sujet). ' +
    'Utilise cet outil quand le boss prend une décision, partage une info importante, ou quand tu veux documenter une stratégie.',
  category: 'memory',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type de mémoire: "decision" | "fact" | "topic" | "fact_remove"',
        enum: ['decision', 'fact', 'fact_remove', 'topic'],
      },
      content: {
        type: 'string',
        description:
          'Pour "decision": description de la décision prise. ' +
          'Pour "fact": fait court (< 100 chars). ' +
          'Pour "fact_remove": le fact exact à supprimer. ' +
          'Pour "topic": contenu markdown complet du topic file.',
      },
      key: {
        type: 'string',
        description: 'Pour "topic" uniquement: clé du fichier, ex: "ventes/strategy". Ignored pour decision/fact.',
      },
      label: {
        type: 'string',
        description: 'Pour "topic" uniquement: label lisible, ex: "Stratégie de vente". Appears in memory index.',
      },
      reason: {
        type: 'string',
        description: 'Pour "decision" uniquement: raison ou contexte de la décision (optionnel).',
      },
    },
    required: ['type', 'content'],
  },

  validate(params: any) {
    const validTypes = ['decision', 'fact', 'fact_remove', 'topic'];
    if (!validTypes.includes(params.type)) {
      return { valid: false, errors: [`type must be one of: ${validTypes.join(', ')}`] };
    }
    if (!params.content || typeof params.content !== 'string') {
      return { valid: false, errors: ['content is required'] };
    }
    if (params.type === 'topic' && !params.key) {
      return { valid: false, errors: ['key is required for type "topic"'] };
    }
    return { valid: true };
  },

  async execute(
    params: { type: string; content: string; key?: string; label?: string; reason?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const engine = new MemoryEngine(context.storeId);

    switch (params.type) {
      case 'decision': {
        await engine.addDecision(params.content, params.reason);
        return {
          success: true,
          data: { saved: true, type: 'decision', message: `Décision mémorisée: "${params.content}"` },
        };
      }

      case 'fact': {
        await engine.addKeyFact(params.content);
        return {
          success: true,
          data: { saved: true, type: 'fact', message: `Fait clé mémorisé: "${params.content}"` },
        };
      }

      case 'fact_remove': {
        await engine.removeKeyFact(params.content);
        return {
          success: true,
          data: { saved: true, type: 'fact_remove', message: `Fait supprimé: "${params.content}"` },
        };
      }

      case 'topic': {
        await engine.saveTopicFile(params.key!, params.content, params.label);
        return {
          success: true,
          data: {
            saved: true,
            type: 'topic',
            key: params.key,
            message: `Topic file sauvegardé: "${params.key}"${params.label ? ` (${params.label})` : ''}`,
          },
        };
      }

      default:
        return { success: false, error: `Unknown memory type: ${params.type}` };
    }
  },
};
