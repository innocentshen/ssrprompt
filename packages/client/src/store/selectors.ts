/**
 * Zustand selectors for optimized state access
 *
 * These selectors help avoid unnecessary re-renders by:
 * 1. Only subscribing to specific parts of the store
 * 2. Using shallow comparison for object/array selections
 * 3. Providing memoized derived data
 */

import { useMemo } from 'react';
import { useGlobalStore } from './useGlobalStore';
import { usePromptsStore } from './usePromptsStore';
import { useTracesStore } from './useTracesStore';
import { useEvaluationStore } from './useEvaluationStore';

// ============= Global Store Selectors =============

/**
 * Get enabled providers only
 */
export const useEnabledProviders = () => {
  const providers = useGlobalStore(state => state.providers);
  return useMemo(() => providers.filter(p => p.enabled), [providers]);
};

/**
 * Get enabled models (models whose provider is enabled)
 */
export const useEnabledModels = () => {
  const providers = useGlobalStore(state => state.providers);
  const models = useGlobalStore(state => state.models);

  return useMemo(() => {
    const enabledProviderIds = new Set(
      providers.filter(p => p.enabled).map(p => p.id)
    );
    return models.filter(m => enabledProviderIds.has(m.providerId));
  }, [providers, models]);
};

/**
 * Get model by ID
 */
export const useModelById = (id: string | null) => {
  const models = useGlobalStore(state => state.models);
  return useMemo(() => {
    if (!id) return null;
    return models.find(m => m.id === id) || null;
  }, [models, id]);
};

/**
 * Get provider by ID
 */
export const useProviderById = (id: string | null) => {
  const providers = useGlobalStore(state => state.providers);
  return useMemo(() => {
    if (!id) return null;
    return providers.find(p => p.id === id) || null;
  }, [providers, id]);
};

/**
 * Get model name by ID
 */
export const useModelName = (id: string | null) => {
  const models = useGlobalStore(state => state.models);
  return useMemo(() => {
    if (!id) return null;
    return models.find(m => m.id === id)?.name || null;
  }, [models, id]);
};

// ============= Prompts Store Selectors =============

/**
 * Get filtered prompts by search query
 */
export const useFilteredPrompts = () => {
  const prompts = usePromptsStore(state => state.prompts);
  const searchQuery = usePromptsStore(state => state.searchQuery);

  return useMemo(() => {
    if (!searchQuery) return prompts;
    const query = searchQuery.toLowerCase();
    return prompts.filter(p => p.name.toLowerCase().includes(query));
  }, [prompts, searchQuery]);
};

/**
 * Get currently selected prompt
 */
export const useSelectedPrompt = () => {
  const prompts = usePromptsStore(state => state.prompts);
  const selectedPromptId = usePromptsStore(state => state.selectedPromptId);

  return useMemo(() => {
    if (!selectedPromptId) return null;
    return prompts.find(p => p.id === selectedPromptId) || null;
  }, [prompts, selectedPromptId]);
};

/**
 * Get editing state as a single object (with shallow comparison)
 */
export const usePromptEditState = () => {
  const content = usePromptsStore(state => state.editingContent);
  const name = usePromptsStore(state => state.editingName);
  const messages = usePromptsStore(state => state.editingMessages);
  const config = usePromptsStore(state => state.editingConfig);
  const variables = usePromptsStore(state => state.editingVariables);

  return useMemo(() => ({ content, name, messages, config, variables }), [content, name, messages, config, variables]);
};

/**
 * Get compare state
 */
export const useCompareState = () => usePromptsStore(state => state.compare);

// ============= Traces Store Selectors =============

/**
 * Get selected trace
 */
export const useSelectedTrace = () => {
  const traces = useTracesStore(state => state.traces);
  const selectedTraceId = useTracesStore(state => state.selectedTraceId);

  return useMemo(() => {
    if (!selectedTraceId) return null;
    return traces.find(t => t.id === selectedTraceId) || null;
  }, [traces, selectedTraceId]);
};

/**
 * Get filtered traces
 */
export const useFilteredTraces = () => {
  const traces = useTracesStore(state => state.traces);
  const selectedPromptId = useTracesStore(state => state.selectedPromptId);
  const filterStatus = useTracesStore(state => state.filterStatus);

  return useMemo(() => {
    let result = traces;

    if (selectedPromptId) {
      result = result.filter(t => t.promptId === selectedPromptId);
    }

    if (filterStatus !== 'all') {
      result = result.filter(t => t.status === filterStatus);
    }

    // Note: TraceListItem doesn't have input/output fields, search disabled for list view
    // Full search would require fetching full trace data

    return result;
  }, [traces, selectedPromptId, filterStatus]);
};

// ============= Evaluation Store Selectors =============

/**
 * Get selected evaluation
 */
export const useSelectedEvaluation = () => {
  const evaluations = useEvaluationStore(state => state.evaluations);
  const selectedEvaluationId = useEvaluationStore(state => state.selectedEvaluationId);

  return useMemo(() => {
    if (!selectedEvaluationId) return null;
    return evaluations.find(e => e.id === selectedEvaluationId) || null;
  }, [evaluations, selectedEvaluationId]);
};

/**
 * Get selected run
 */
export const useSelectedRun = () => {
  const runs = useEvaluationStore(state => state.runs);
  const selectedRunId = useEvaluationStore(state => state.selectedRunId);

  return useMemo(() => {
    if (!selectedRunId) return null;
    return runs.find(r => r.id === selectedRunId) || null;
  }, [runs, selectedRunId]);
};

/**
 * Get evaluation results for selected run
 */
export const useRunResults = () => {
  const results = useEvaluationStore(state => state.results);
  const selectedRunId = useEvaluationStore(state => state.selectedRunId);

  return useMemo(() => {
    if (!selectedRunId) return [];
    return results.filter(r => r.runId === selectedRunId);
  }, [results, selectedRunId]);
};

/**
 * Calculate pass rate for current results
 */
export const usePassRate = () => {
  const results = useEvaluationStore(state => state.results);

  return useMemo(() => {
    if (results.length === 0) return 0;
    const passedCount = results.filter(r => r.passed).length;
    return (passedCount / results.length) * 100;
  }, [results]);
};
