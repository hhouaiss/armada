'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Zap, AlertCircle, Check, Loader2, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AgentAppTools } from '@/components/agent-app-tools';

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    icon: '🤖',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'Premium', pricing: '$15/$75 per 1M tokens', description: 'Most capable for complex tasks' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', tier: 'Balanced', pricing: '$3/$15 per 1M tokens', description: 'Best balance of speed and intelligence' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', tier: 'Fast', pricing: '$0.80/$4 per 1M tokens', description: 'Fastest, most affordable' },
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    icon: '🔮',
    models: [
      { id: 'o3', name: 'o3 (High Performance)', tier: 'Premium', pricing: '$2/$8 per 1M tokens', description: 'Advanced reasoning for complex problems' },
      { id: 'gpt-4o', name: 'GPT-4o (Medium)', tier: 'Balanced', pricing: '$2.50/$10 per 1M tokens', description: 'Excellent for general tasks' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini (Cost-Effective)', tier: 'Fast', pricing: '$0.15/$0.60 per 1M tokens', description: '97% cheaper, great for simple tasks' },
    ],
  },
  openrouter: {
    name: 'OpenRouter (Open Source)',
    icon: '🌐',
    models: [
      { id: 'stealth/ox-alpha', name: 'Ox Alpha', tier: 'Premium', pricing: 'Free (stealth preview)', description: 'Modèle stealth avec 1M de contexte — gratuit pendant la préversion, les prompts peuvent être partagés avec le fournisseur' },
      { id: 'z-ai/glm-5.2', name: 'GLM-5.2', tier: 'Premium', pricing: '$0.60/$2 per 1M tokens', description: 'Z.AI flagship — strong agentic, reasoning and coding performance at open source cost' },
      { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', tier: 'Premium', pricing: '$0.50/$1.50 per 1M tokens', description: 'Most capable DeepSeek model — strong reasoning and coding, at open source cost' },
      { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', tier: 'Fast', pricing: '$0.07/$0.28 per 1M tokens', description: 'Ultra-low cost variant — ideal for high-volume tasks and quick responses' },
      { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', tier: 'Premium', pricing: '$0.23/$3 per 1M tokens', description: 'Multimodal model with 262K context, excellent for visual coding and reasoning' },
      { id: 'google/gemma-4-31b-it', name: 'Gemma 4 31B', tier: 'Fast', pricing: 'Free / low cost', description: 'Google open source model, fast and efficient for everyday tasks' },
    ],
  },
  ollama: {
    name: 'Local Models (Ollama)',
    icon: '🦙',
    models: [
      { id: 'gemma4:e4b', name: 'Gemma 4 E4B', tier: 'Free', pricing: 'No cost — runs locally', description: 'Google Gemma 4 quantized, runs on your machine via Ollama. Zero API cost.' },
    ],
  },
};

const agentPersonalities: Record<string, { name: string; role: string; defaultTask: string }> = {
  product:   { name: 'Sarah',      role: 'Product Specialist',  defaultTask: 'Managing product catalog' },
  inventory: { name: 'Marcus',     role: 'Inventory Manager',   defaultTask: 'Monitoring stock levels' },
  support:   { name: 'Emma',       role: 'Customer Success',    defaultTask: 'Organizing customer data' },
  content:   { name: 'Alex',       role: 'Content Creator',     defaultTask: 'Writing and publishing content' },
  seo:       { name: 'Olivia',     role: 'SEO Specialist',      defaultTask: 'Tracking rankings and search performance' },
  major:     { name: 'The Major',  role: 'Chief of Staff',      defaultTask: 'Orchestrating the squad' },
};

export default function AgentSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5-20250929');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ClawXRouter state
  const [routingMode, setRoutingMode] = useState<'fixed' | 'auto'>('fixed');
  const [autoSimpleModel, setAutoSimpleModel] = useState('google/gemma-4-31b-it');
  const [autoComplexModel, setAutoComplexModel] = useState('moonshotai/kimi-k2.5');

  // Skills management
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [agentSkills, setAgentSkills] = useState<any[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);

  useEffect(() => {
    loadAgent();
    loadApiKeys();
    loadSkills();
  }, [agentId]);

  const loadAgent = async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}`);
      const data = await res.json();
      setAgent(data.agent);
      setSelectedProvider(data.agent.modelProvider || 'anthropic');
      setSelectedModel(data.agent.modelName || 'claude-sonnet-4-5-20250929');
      setRoutingMode(data.agent.routingMode || 'fixed');
      setAutoSimpleModel(data.agent.autoSimpleModel || 'google/gemma-4-31b-it');
      setAutoComplexModel(data.agent.autoComplexModel || 'moonshotai/kimi-k2.5');
    } catch (error) {
      console.error('Failed to load agent:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = async () => {
    try {
      const res = await fetch('/api/llm-keys');
      const data = await res.json();
      setApiKeys(data.keys || []);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const loadSkills = async () => {
    setLoadingSkills(true);
    try {
      // Load all available skills
      const skillsRes = await fetch('/api/skills');
      const skillsData = await skillsRes.json();
      setAllSkills(skillsData.skills || []);

      // Load agent's assigned skills
      const agentSkillsRes = await fetch(`/api/agents/${agentId}/skills`);
      const agentSkillsData = await agentSkillsRes.json();
      setAgentSkills(agentSkillsData.skills || []);
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setLoadingSkills(false);
    }
  };

  const handleAssignSkill = async (skillId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, priority: 0 }),
      });

      if (res.ok) {
        loadSkills(); // Reload skills
        alert('Skill assigned successfully! The agent will use it in the next conversation.');
      }
    } catch (error) {
      console.error('Failed to assign skill:', error);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    try {
      await fetch(`/api/agents/${agentId}/skills?skillId=${skillId}`, {
        method: 'DELETE',
      });
      loadSkills(); // Reload skills
    } catch (error) {
      console.error('Failed to remove skill:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelProvider: selectedProvider,
          modelName: selectedModel,
          routingMode,
          autoSimpleModel,
          autoComplexModel,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF6B35]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-muted-foreground">Agent not found</p>
        </div>
      </div>
    );
  }

  const personality = agentPersonalities[agent.type] || { name: agent.name, role: agent.type, defaultTask: '' };
  const providerHasKey = routingMode === 'auto'
    ? apiKeys.some((k: any) => k.provider === 'openrouter')
    : apiKeys.some((k: any) => k.provider === selectedProvider);
  const selectedProviderData = PROVIDERS[selectedProvider as keyof typeof PROVIDERS];
  const selectedModelData = selectedProviderData?.models.find((m) => m.id === selectedModel);
  const openrouterHasKey = apiKeys.some((k: any) => k.provider === 'openrouter');

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <Link
          href="/team"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm uppercase tracking-wide">Back to Team</span>
        </Link>

        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-[#FF6B35]/10 border border-[#FF6B35]/20 flex-shrink-0">
            <Bot className="h-7 w-7 text-[#FF6B35]" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight mb-2">{personality.name}</h1>
            <p className="text-muted-foreground uppercase tracking-wide text-sm mb-2">{personality.role}</p>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-[#FF6B35] rounded-full animate-pulse" />
              <span className="text-muted-foreground">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Model Selection */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-2">AI MODEL</h2>
          <p className="text-muted-foreground text-sm">
            Choose the AI model that powers {personality.name}. Different models offer different trade-offs between cost, speed, and capability.
          </p>
        </div>

        {/* Routing Mode Toggle */}
        <div>
          <label className="text-sm text-muted-foreground uppercase tracking-wide mb-3 block">Mode</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setRoutingMode('fixed')}
              className={`p-4 rounded-lg border transition-all text-left ${
                routingMode === 'fixed'
                  ? 'bg-[#FF6B35]/10 border-[#FF6B35]'
                  : 'bg-card border-border hover:border-[#FF6B35]/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Bot className="w-5 h-5 text-foreground" />
                <div className="text-sm font-bold text-foreground uppercase tracking-wide">Fixed Model</div>
              </div>
              <div className="text-xs text-muted-foreground">Toujours le même modèle, quel que soit le type de requête.</div>
              {routingMode === 'fixed' && (
                <div className="flex items-center gap-2 text-xs text-[#FF6B35] mt-2">
                  <Check className="w-3 h-3" />
                  <span>Actif</span>
                </div>
              )}
            </button>

            <button
              onClick={() => setRoutingMode('auto')}
              className={`p-4 rounded-lg border transition-all text-left ${
                routingMode === 'auto'
                  ? 'bg-[#FF6B35]/10 border-[#FF6B35]'
                  : 'bg-card border-border hover:border-[#FF6B35]/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Shuffle className="w-5 h-5 text-foreground" />
                <div className="text-sm font-bold text-foreground uppercase tracking-wide">Auto Routing</div>
              </div>
              <div className="text-xs text-muted-foreground">Modèle léger pour les requêtes simples, Kimi K2.5 pour les tâches complexes.</div>
              {routingMode === 'auto' && (
                <div className="flex items-center gap-2 text-xs text-[#FF6B35] mt-2">
                  <Check className="w-3 h-3" />
                  <span>Actif — -70% coûts estimés</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Auto Routing Config */}
        {routingMode === 'auto' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {!openrouterHasKey && (
              <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-300 font-medium mb-1">Clé OpenRouter requise</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      L'Auto Routing utilise OpenRouter pour les deux modèles. Ajoutez votre clé pour activer cette fonctionnalité.
                    </p>
                    <Link
                      href="/settings/models"
                      className="inline-block px-4 py-2 rounded bg-[#FF6B35] text-white text-sm font-medium hover:bg-[#FF6B35]/90 transition-colors uppercase tracking-wide"
                    >
                      Ajouter la clé OpenRouter
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Simple model picker */}
            <div>
              <label className="text-sm text-muted-foreground uppercase tracking-wide mb-1 block">
                Modèle simple
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Utilisé pour les requêtes courtes et les lookups de données (listes, comptages, recherches).
              </p>
              <div className="space-y-2">
                {PROVIDERS.openrouter.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setAutoSimpleModel(model.id)}
                    className={`w-full p-4 rounded-lg border transition-all text-left ${
                      autoSimpleModel === model.id
                        ? 'bg-[#FF6B35]/10 border-[#FF6B35]'
                        : 'bg-card border-border hover:border-[#FF6B35]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="text-foreground font-bold text-sm">{model.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded uppercase tracking-wide bg-green-950/50 text-green-300 border border-green-500/20">
                          {model.tier}
                        </span>
                        {autoSimpleModel === model.id && <Check className="w-4 h-4 text-[#FF6B35]" />}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{model.pricing}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Complex model picker */}
            <div>
              <label className="text-sm text-muted-foreground uppercase tracking-wide mb-1 block">
                Modèle complexe
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Utilisé pour les analyses, rédactions, stratégies et tâches multi-étapes.
              </p>
              <div className="space-y-2">
                {PROVIDERS.openrouter.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setAutoComplexModel(model.id)}
                    className={`w-full p-4 rounded-lg border transition-all text-left ${
                      autoComplexModel === model.id
                        ? 'bg-[#FF6B35]/10 border-[#FF6B35]'
                        : 'bg-card border-border hover:border-[#FF6B35]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="text-foreground font-bold text-sm">{model.name}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded uppercase tracking-wide ${
                          model.tier === 'Premium'
                            ? 'bg-purple-950/50 text-purple-300 border border-purple-500/20'
                            : 'bg-green-950/50 text-green-300 border border-green-500/20'
                        }`}>
                          {model.tier}
                        </span>
                        {autoComplexModel === model.id && <Check className="w-4 h-4 text-[#FF6B35]" />}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{model.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">{model.pricing}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-muted/30 border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-[#FF6B35] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-foreground font-medium mb-1">Comment ça marche</p>
                  <p className="text-xs text-muted-foreground">
                    Chaque message est analysé en ~0ms (heuristique locale, sans appel API). Les requêtes courtes
                    et lookups vont sur le modèle rapide. Les analyses, rédactions et requêtes complexes vont sur
                    Kimi K2.5. Économies estimées: <strong className="text-foreground">-70% sur les coûts LLM</strong>.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Fixed model: Provider + Model Selection */}
        {routingMode === 'fixed' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Provider Selection */}
            <div>
              <label className="text-sm text-muted-foreground uppercase tracking-wide mb-3 block">Provider</label>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(PROVIDERS).map(([providerId, provider]) => {
                  const hasKey = apiKeys.some((k: any) => k.provider === providerId);
                  const isSelected = selectedProvider === providerId;

                  if (!hasKey && providerId === 'ollama') {
                    return (
                      <Link
                        key={providerId}
                        href="/settings?tab=api-keys"
                        className="p-4 rounded-lg border border-border bg-card text-left hover:border-[#FF6B35]/50 transition-all"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-2xl">{provider.icon}</div>
                          <div className="text-sm font-bold text-foreground uppercase tracking-wide">{provider.name}</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#FF6B35]">
                          <AlertCircle className="w-3 h-3" />
                          <span>Configurer l'URL dans Settings →</span>
                        </div>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={providerId}
                      onClick={() => {
                        setSelectedProvider(providerId);
                        const defaultModel = provider.models[1] || provider.models[0];
                        setSelectedModel(defaultModel.id);
                      }}
                      disabled={!hasKey}
                      className={`p-4 rounded-lg border transition-all text-left ${
                        isSelected
                          ? 'bg-[#FF6B35]/10 border-[#FF6B35]'
                          : hasKey
                          ? 'bg-card border-border hover:border-[#FF6B35]/30'
                          : 'bg-card border-border opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-2xl">{provider.icon}</div>
                        <div className="text-sm font-bold text-foreground uppercase tracking-wide">{provider.name}</div>
                      </div>
                      {!hasKey && (
                        <div className="flex items-center gap-2 text-xs text-yellow-400">
                          <AlertCircle className="w-3 h-3" />
                          <span>API Key Required</span>
                        </div>
                      )}
                      {hasKey && isSelected && (
                        <div className="flex items-center gap-2 text-xs text-[#FF6B35]">
                          <Check className="w-3 h-3" />
                          <span>Selected</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {Object.values(PROVIDERS).every(
                (_, i) => !apiKeys.some((k: any) => k.provider === Object.keys(PROVIDERS)[i])
              ) && (
                <div className="mt-4 bg-blue-950/20 border border-blue-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-300 font-medium mb-1">No API Keys Configured</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        You need to add at least one API key to use AI models.
                      </p>
                      <Link
                        href="/settings/models"
                        className="inline-block px-4 py-2 rounded bg-[#FF6B35] text-white text-sm font-medium hover:bg-[#FF6B35]/90 transition-colors uppercase tracking-wide"
                      >
                        Add API Key
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Model Selection */}
            {providerHasKey && (
              <div>
                <label className="text-sm text-muted-foreground uppercase tracking-wide mb-3 block">Model</label>
                <div className="space-y-3">
                  {selectedProviderData?.models.map((model) => {
                    const isSelected = selectedModel === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={`w-full p-4 rounded-lg border transition-all text-left ${
                          isSelected
                            ? 'bg-[#FF6B35]/10 border-[#FF6B35]'
                            : 'bg-card border-border hover:border-[#FF6B35]/30'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="text-foreground font-bold mb-1">{model.name}</div>
                            <div className="text-xs text-muted-foreground">{model.description}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-2 py-1 rounded uppercase tracking-wide ${
                                model.tier === 'Premium'
                                  ? 'bg-purple-950/50 text-purple-300 border border-purple-500/20'
                                  : model.tier === 'Balanced'
                                  ? 'bg-blue-950/50 text-blue-300 border border-blue-500/20'
                                  : model.tier === 'Free'
                                  ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/20'
                                  : 'bg-green-950/50 text-green-300 border border-green-500/20'
                              }`}
                            >
                              {model.tier}
                            </span>
                            {isSelected && <Check className="w-5 h-5 text-[#FF6B35]" />}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">{model.pricing}</div>
                      </button>
                    );
                  })}
                </div>

                {selectedModelData && (
                  <div className="mt-4 bg-muted/30 border border-border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-[#FF6B35] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-foreground font-medium mb-1">Selected: {selectedModelData.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedModelData.tier === 'Fast' && 'Most cost-effective option. Great for high-volume, straightforward tasks like inventory monitoring and customer data organization.'}
                          {selectedModelData.tier === 'Balanced' && 'Best balance of performance and cost. Ideal for most tasks including product optimization and content creation.'}
                          {selectedModelData.tier === 'Premium' && 'Most capable model for complex reasoning and creative tasks. Best for strategic SEO content and advanced product analysis.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Save Button */}
        <div className="flex items-center gap-4 pt-4">
          <Button
            onClick={handleSave}
            disabled={saving || (routingMode === 'fixed' && !providerHasKey)}
            className="bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>

          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-green-400 text-sm"
            >
              <Check className="w-4 h-4" />
              <span>Changes saved successfully</span>
            </motion.div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-950/20 border border-blue-500/20 rounded-lg p-6">
          <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wide mb-2">
            💡 Model Selection Tips
          </h3>
          <ul className="text-sm text-foreground/80 space-y-2">
            <li>• <strong>Product/Content:</strong> Use Balanced or Premium for creative tasks</li>
            <li>• <strong>Inventory/Support:</strong> Use Fast models for routine monitoring</li>
            <li>• <strong>Cost Savings:</strong> GPT-4o-mini is 97% cheaper than Claude Sonnet</li>
            <li>• <strong>Zero cost:</strong> Use Gemma 4 E4B via Ollama for tasks where local inference is enough</li>
            <li>• You can change models anytime - changes take effect immediately</li>
          </ul>
        </div>

        <AgentAppTools agentId={agentId} agentName={personality.name} />

        {/* Agent Skills */}
        <div className="border-t border-border pt-6 mt-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold tracking-tight mb-2">AGENT SKILLS</h2>
            <p className="text-muted-foreground text-sm">
              Teach {personality.name} persistent knowledge like email templates, brand voice, or communication patterns.
            </p>
          </div>

          {loadingSkills ? (
            <div className="text-center py-6">
              <div className="w-8 h-8 border-4 border-[#FF6B35] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <>
              {/* Assigned Skills */}
              {agentSkills.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-3">Active Skills</h3>
                  <div className="space-y-2">
                    {agentSkills.map((agentSkill: any) => (
                      <div
                        key={agentSkill.id}
                        className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{agentSkill.skill.icon || '📚'}</div>
                          <div>
                            <p className="text-foreground font-medium">{agentSkill.skill.name}</p>
                            <p className="text-xs text-muted-foreground">{agentSkill.skill.description}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveSkill(agentSkill.skillId)}
                          className="px-4 py-2 rounded border border-border text-foreground/80 hover:border-red-500/50 hover:text-red-400 transition-all uppercase tracking-wide text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Skills to Assign */}
              {allSkills.length > 0 && (
                <div>
                  <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-3">Available Skills</h3>
                  <div className="space-y-2">
                    {allSkills
                      .filter((skill: any) => !agentSkills.some((as: any) => as.skillId === skill.id))
                      .map((skill: any) => (
                        <div
                          key={skill.id}
                          className="bg-card border border-border rounded-lg p-4 flex items-center justify-between hover:border-[#FF6B35]/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">{skill.icon || '📚'}</div>
                            <div>
                              <p className="text-foreground font-medium">{skill.name}</p>
                              <p className="text-xs text-muted-foreground">{skill.description}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAssignSkill(skill.id)}
                            className="px-4 py-2 rounded bg-[#FF6B35] text-white hover:bg-[#FF6B35]/90 transition-colors uppercase tracking-wide text-xs"
                          >
                            Assign
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {allSkills.length === 0 && (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <p className="text-muted-foreground mb-4">No skills created yet</p>
                  <Link
                    href="/skills"
                    className="inline-block px-6 py-2 rounded bg-[#FF6B35] text-white text-sm font-medium hover:bg-[#FF6B35]/90 transition-colors uppercase tracking-wide"
                  >
                    Create First Skill
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
