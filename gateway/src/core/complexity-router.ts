export type Complexity = 'simple' | 'moyenne' | 'complexe';

// ── Simple signals — fast data lookup, direct questions ───────────────────────
const SIMPLE_KEYWORDS = [
  // French
  'liste', 'montre', 'affiche', 'combien', 'quel est', 'quels sont', 'quelle est',
  'donne-moi', 'donne moi', 'montre-moi', 'cherche', 'trouve', 'recherche',
  'vrai ou faux', 'oui ou non', 'c\'est quoi', 'c\'est combien',
  'quel prix', 'quel stock', 'quelle quantité',
  // English
  'show', 'list', 'get', 'how many', 'what is', 'display', 'find', 'fetch', 'give me',
  'count', 'total', 'check', 'how much', 'what price', 'is it',
];

// ── Complex signals — strategy, writing, multi-domain ────────────────────────
const COMPLEX_KEYWORDS = [
  // French — strategic analysis
  'stratégie', 'analyse', 'analyser', 'audite', 'auditer',
  'plan d\'action', 'feuille de route', 'roadmap',
  'comment puis-je', 'comment je peux', 'qu\'est-ce que je dois',
  'aide-moi à réfléchir', 'aide-moi à construire', 'aide-moi à définir',
  // French — writing tasks
  'rédige', 'rédiger', 'écris', 'écrire', 'génère', 'générer',
  'crée un article', 'crée un email', 'crée un rapport',
  'rédige un', 'rédige une', 'écris un', 'écris une',
  'article de blog', 'email client', 'newsletter', 'campagne',
  // English — strategy
  'strategy', 'roadmap', 'action plan', 'help me think', 'help me build',
  'how should i', 'what should i do', 'can you help me',
  // English — writing
  'write a', 'draft a', 'generate a', 'create a report', 'write an',
  'blog post', 'email campaign', 'case study',
];

// ── Medium signals — explanation, comparison, moderate analysis ───────────────
const MEDIUM_KEYWORDS = [
  // French
  'explique', 'expliquer', 'compare', 'comparer',
  'optimise', 'optimiser', 'améliore', 'améliorer',
  'propose', 'proposer', 'suggère', 'suggérer',
  'résume', 'résumer', 'traduis', 'traduire',
  'formate', 'formater', 'organise', 'organiser',
  'pourquoi', 'comment ça marche', 'quelle différence',
  'quels sont les avantages', 'quels sont les inconvénients',
  // English
  'explain', 'compare', 'optimize', 'improve', 'suggest', 'recommend',
  'summarize', 'translate', 'format', 'organize',
  'why', 'how does', 'what are the benefits', 'what is the difference',
  'pros and cons',
];

// ── Writing/creative task detector ───────────────────────────────────────────
const WRITING_PATTERNS = [
  /rédige?\s+(un|une|le|la|les)/i,
  /écris?\s+(un|une|le|la|les)/i,
  /génère?\s+(un|une|le|la|les)/i,
  /write\s+(a|an|the)/i,
  /draft\s+(a|an|the)/i,
  /article|blog|newsletter|email|rapport|analyse\s+seo/i,
];

/**
 * Classifies a message into 3 tiers:
 *   simple   → data lookup, direct question, short query
 *   moyenne  → explanation, comparison, moderate analysis, reformatting
 *   complexe → strategy, writing tasks, multi-domain reasoning
 *
 * Zero API calls — pure heuristic, ~0ms latency.
 */
export function classifyComplexity(message: string): Complexity {
  const lower = message.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  const questionCount = (lower.match(/\?/g) || []).length;

  // Hard simple: very short messages are almost always data lookups or confirmations
  if (wordCount < 6) return 'simple';

  // Hard complex: writing tasks always use a capable model
  if (WRITING_PATTERNS.some(p => p.test(lower))) return 'complexe';

  // Score each tier
  const complexScore =
    COMPLEX_KEYWORDS.filter(k => lower.includes(k)).length * 3 +
    (wordCount > 60 ? 3 : wordCount > 35 ? 1 : 0) +
    (questionCount > 2 ? 2 : 0);

  const mediumScore =
    MEDIUM_KEYWORDS.filter(k => lower.includes(k)).length * 2 +
    (wordCount > 20 ? 1 : 0) +
    (questionCount === 2 ? 1 : 0);

  const simpleScore =
    SIMPLE_KEYWORDS.filter(k => lower.includes(k)).length * 2 +
    (wordCount < 12 ? 2 : 0);

  // Resolve tier by highest score
  const max = Math.max(complexScore, mediumScore, simpleScore);

  if (max === 0) {
    // No strong signal — default by word count
    if (wordCount < 12) return 'simple';
    if (wordCount < 30) return 'moyenne';
    return 'complexe';
  }

  if (complexScore === max) return 'complexe';
  if (mediumScore === max) return 'moyenne';
  return 'simple';
}
