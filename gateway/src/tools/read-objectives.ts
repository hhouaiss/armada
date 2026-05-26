/**
 * read_objectives — Mission Control Tool
 *
 * Allows The Major (and other agents) to read the store's active objectives
 * and dispatched projects. Used at session start and during nightly planning
 * to prioritize work intelligently.
 */

import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';
import { prisma } from '../lib/database.js';

export const readObjectivesTool: AgentTool = {
  name: 'read_objectives',
  description:
    'Read the active strategic objectives and projects set by the owner. ' +
    'Use this at the start of each session to understand current priorities, ' +
    'and during planning to decide which tasks to dispatch to the team.',
  category: 'orchestration',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: active (default), completed, blocked, all',
        enum: ['active', 'completed', 'blocked', 'all'],
      },
    },
  },

  async execute(params: { status?: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const statusFilter = params.status || 'active';

      const objectives = await prisma.objective.findMany({
        where: {
          storeId: context.storeId,
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          projects: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (objectives.length === 0) {
        return {
          success: true,
          data: {
            objectives: [],
            summary: 'Aucun objectif actif. Le propriétaire peut en ajouter depuis Mission Control (/objectives).',
          },
        };
      }

      // Build a structured summary for the agent
      const priorityLabels: Record<number, string> = { 1: 'Basse', 2: 'Moyenne', 3: 'Haute' };
      const typeLabels: Record<string, string> = {
        mission: 'Mission',
        quarterly: 'Objectif trimestriel',
        weekly: 'Objectif hebdomadaire',
        onetime: 'Tâche unique',
      };

      const summary = objectives
        .map((obj) => {
          const projects = obj.projects
            .filter((p) => p.status === 'active')
            .map((p) => `  → [${p.status.toUpperCase()}] ${p.title}${p.ownerAgentId ? ` (owner: ${p.ownerAgentId})` : ''}`)
            .join('\n');

          const due = obj.dueDate
            ? ` | Échéance: ${new Date(obj.dueDate).toLocaleDateString('fr-FR')}`
            : '';

          return [
            `## ${typeLabels[obj.type] ?? obj.type} — ${obj.title}`,
            `Priorité: ${priorityLabels[obj.priority] ?? obj.priority} | Statut: ${obj.status}${due}`,
            obj.description ? `Description: ${obj.description}` : '',
            obj.notes ? `Notes: ${obj.notes}` : '',
            projects ? `Projets actifs:\n${projects}` : 'Aucun projet actif (à créer et dispatcher)',
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n---\n\n');

      return {
        success: true,
        data: {
          count: objectives.length,
          objectives,
          summary,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read objectives',
      };
    }
  },
};
