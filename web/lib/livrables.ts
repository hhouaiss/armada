// ── Livrables — Types & agent metadata ────────────────────────────────────────
// No mock data. All livrables come from the real DB via /api/livrables.

export type SectionType = 'insight' | 'issue' | 'opportunity' | 'info';

/** A livrable as returned by the API (list view — full content included). */
export interface Livrable {
  id: string;
  slug: string;
  title: string;
  content: string;   // Full markdown from the agent
  agentName: string;
  agentType: string;
  isRead: boolean;
  createdAt: string; // ISO string
}

/** Agent colour classes by agentType */
export const AGENT_COLORS: Record<string, string> = {
  seo:       'bg-green-500/10 text-green-600 border-green-500/20',
  major:     'bg-[var(--armada-primary)]/10 text-[var(--armada-primary)] border-[var(--armada-primary)]/20',
  content:   'bg-purple-500/10 text-purple-500 border-purple-500/20',
  product:   'bg-blue-500/10 text-blue-500 border-blue-500/20',
  inventory: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  support:   'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

/** Custom event dispatched when a livrable is marked as read (for sidebar badge sync). */
export const LIVRABLES_CHANGED_EVENT = 'armada:livrables-changed';

export function dispatchLivrablesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LIVRABLES_CHANGED_EVENT));
  }
}
