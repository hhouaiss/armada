export type Complexity = 'simple' | 'complex';

const SIMPLE_KEYWORDS = [
  // French
  'liste', 'montre', 'affiche', 'combien', 'quel est', 'quels sont', 'quelle est',
  'donne-moi', 'donne moi', 'montre-moi', 'cherche', 'trouve', 'recherche',
  // English
  'show', 'list', 'get', 'how many', 'what is', 'display', 'find', 'fetch', 'give me',
  'count', 'total', 'check',
];

const COMPLEX_KEYWORDS = [
  // French
  'analyse', 'analyser', 'stratégie', 'crée', 'créer', 'rédige', 'rédiger',
  'explique', 'expliquer', 'compare', 'comparer', 'optimise', 'optimiser',
  'améliore', 'améliorer', 'propose', 'proposer', 'suggère', 'suggérer',
  'plan', 'planifie', 'génère', 'générer', 'aide-moi', 'aide moi',
  'comment puis-je', 'comment je peux', 'qu\'est-ce que je dois',
  // English
  'analyze', 'strategy', 'write', 'create', 'draft', 'generate',
  'explain', 'compare', 'optimize', 'improve', 'suggest', 'recommend',
  'help me', 'how should i', 'what should i', 'can you help',
];

/**
 * Classifies a message as 'simple' (data lookup, short query) or 'complex'
 * (analysis, writing, strategy, multi-step reasoning).
 *
 * Zero API calls — pure heuristic, ~0ms latency.
 */
export function classifyComplexity(message: string): Complexity {
  const lower = message.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Hard simple: very short messages are almost always data lookups
  if (wordCount < 8) return 'simple';

  const complexScore =
    COMPLEX_KEYWORDS.filter((k) => lower.includes(k)).length * 2 +
    (wordCount > 40 ? 2 : wordCount > 20 ? 1 : 0) +
    ((lower.match(/\?/g) || []).length > 1 ? 1 : 0);

  const simpleScore = SIMPLE_KEYWORDS.filter((k) => lower.includes(k)).length;

  return complexScore > simpleScore ? 'complex' : 'simple';
}
