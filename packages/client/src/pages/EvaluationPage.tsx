import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Play,
  BarChart3,
  Trash2,
  AlertCircle,
  Settings2,
  FileText,
  Loader2,
  History,
  Copy,
  Pencil,
  Check,
  X,
  Globe,
} from 'lucide-react';
import { Button, Input, Modal, Badge, Select, useToast, ModelSelector } from '../components/ui';
import { PromptCascader } from '../components/Common/PromptCascader';
import { TestCaseList, CriteriaEditor, EvaluationResultsView, RunHistory } from '../components/Evaluation';
import { ParameterPanel } from '../components/Prompt/ParameterPanel';
import { evaluationsApi, runsApi, promptsApi, promptGroupsApi, providersApi, modelsApi, type EvaluationWithRelations } from '../api';
import { chatApi, type ContentPart } from '../api/chat';
import type { FileAttachment } from '../lib/ai-service';
import { getFileUploadCapabilities } from '../lib/model-capabilities';
import { cacheEvents } from '../lib/cache-events';
import { formatDateTime } from '../lib/date-utils';
import { DEFAULT_PROMPT_CONFIG } from '../types';
import type {
  Prompt,
  Model,
  Provider,
  EvaluationStatus,
  TestCase,
  EvaluationCriterion,
  TestCaseResult,
  PromptVariable,
  EvaluationRun,
  PromptConfig,
  ModelParameters,
  EvaluationConfig,
  PromptGroup,
} from '../types';

const statusConfig: Record<EvaluationStatus, { labelKey: string; variant: 'info' | 'warning' | 'success' | 'error' }> = {
  pending: { labelKey: 'pending', variant: 'info' },
  running: { labelKey: 'running', variant: 'warning' },
  completed: { labelKey: 'completed', variant: 'success' },
  failed: { labelKey: 'failed', variant: 'error' },
};

type TabType = 'testcases' | 'criteria' | 'history' | 'results';

// 缓存数据类型（不包含附件文件本体，仅 fileId 引用，避免内存过大）
interface EvaluationCacheData {
  testCases: TestCase[];
  criteria: EvaluationCriterion[];
  runs: EvaluationRun[];
  results: TestCaseResult[];
  selectedRunId: string | null;
}

// 使用内存缓存，不用 localStorage（附件数据太大）
const evaluationCache = new Map<string, EvaluationCacheData>();
// Track per-evaluation draft edits (not yet submitted)
const evaluationDraftDirty = new Set<string>();

// 列表缓存
interface ListCache {
  evaluations: EvaluationWithRelations[];
  prompts: Prompt[];
  promptGroups: PromptGroup[];
  models: Model[];
  providers: Provider[];
}

let listCache: ListCache | null = null;
const loadingEvaluations = new Set<string>();  // 正在加载的评测ID集合

export function EvaluationPage() {
  const { showToast } = useToast();
  const { t } = useTranslation('evaluation');
  const { t: tCommon } = useTranslation('common');
  const [evaluations, setEvaluations] = useState<EvaluationWithRelations[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptGroups, setPromptGroups] = useState<PromptGroup[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationWithRelations | null>(null);
  const [showNewEval, setShowNewEval] = useState(false);
  const [newEvalName, setNewEvalName] = useState('');
  const [newEvalPrompt, setNewEvalPrompt] = useState('');
  const [newEvalModel, setNewEvalModel] = useState('');
  const [newEvalJudgeModel, setNewEvalJudgeModel] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>('testcases');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvaluationRun | null>(null);
  const [runningCount, setRunningCount] = useState(0);
  const [runningTestCaseId, setRunningTestCaseId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [submittingNewVersion, setSubmittingNewVersion] = useState(false);
  // 评测模型参数配置
  const [evalModelConfig, setEvalModelConfig] = useState<PromptConfig>(DEFAULT_PROMPT_CONFIG);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const abortControllersRef = useRef<Map<string, { aborted: boolean }>>(new Map());
  const selectedEvaluationIdRef = useRef<string | null>(null);

  // 同步 ref 以便在异步操作中访问最新的 selectedEvaluation
  useEffect(() => {
    selectedEvaluationIdRef.current = selectedEvaluation?.id || null;
  }, [selectedEvaluation]);

  // 计算当前评测模型的文件上传能力
  const fileUploadCapabilities = useMemo(() => {
    if (!selectedEvaluation?.modelId) {
      return { accept: '.txt,.md,.json,.csv,.xml,.yaml,.yml', canUploadImage: false, canUploadPdf: false, canUploadText: true };
    }
    const model = models.find((m) => m.id === selectedEvaluation.modelId);
    const provider = providers.find((p) => p.id === model?.providerId);
    if (!model || !provider) {
      return { accept: '.txt,.md,.json,.csv,.xml,.yaml,.yml', canUploadImage: false, canUploadPdf: false, canUploadText: true };
    }
    return getFileUploadCapabilities(provider.type, model.modelId, model.supportsVision ?? true);
  }, [selectedEvaluation?.modelId, models, providers]);

  // 获取当前评测模型的信息用于传递给子组件
  const currentModelInfo = useMemo(() => {
    if (!selectedEvaluation?.modelId) {
      return { providerType: undefined, modelId: undefined, supportsVision: true };
    }
    const model = models.find((m) => m.id === selectedEvaluation.modelId);
    const provider = providers.find((p) => p.id === model?.providerId);
    return {
      providerType: provider?.type,
      modelId: model?.modelId,
      supportsVision: model?.supportsVision ?? true,
    };
  }, [selectedEvaluation?.modelId, models, providers]);

  useEffect(() => {
    loadData();
  }, []);

  // 监听缓存失效事件，当其他页面更新数据时刷新
  useEffect(() => {
    const unsubscribe = cacheEvents.subscribe((type, data) => {
      if (type === 'prompts') {
        // 如果有更新的 prompt 数据，直接更新 prompts 状态
        if (data && typeof data === 'object' && 'id' in data) {
          const updatedPrompt = data as Prompt;
          setPrompts((prev) =>
            prev.some((p) => p.id === updatedPrompt.id)
              ? prev.map((p) => (p.id === updatedPrompt.id ? updatedPrompt : p))
              : [updatedPrompt, ...prev]
          );
          // 同时更新 listCache（如果存在）
          if (listCache) {
            listCache.prompts = listCache.prompts.some((p: Prompt) => p.id === updatedPrompt.id)
              ? listCache.prompts.map((p: Prompt) => (p.id === updatedPrompt.id ? updatedPrompt : p))
              : [updatedPrompt, ...listCache.prompts];
          }
        } else {
          // 清除列表缓存，下次加载时会重新获取数据
          listCache = null;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadEvaluationDetails = useCallback(async (evaluationId: string) => {
    // 检查缓存 - 有缓存直接使用
    const cached = evaluationCache.get(evaluationId);
    if (cached) {
      setDetailsLoading(false);
      setTestCases(cached.testCases);
      setCriteria(cached.criteria);
      setRuns(cached.runs);
      setResults(cached.results);
      setSelectedRun(cached.runs.find(r => r.id === cached.selectedRunId) || null);
      return;
    }

    // 如果正在加载这个评测，只需要显示加载状态，不重复发起请求
    if (loadingEvaluations.has(evaluationId)) {
      setDetailsLoading(true);
      setTestCases([]);
      setCriteria([]);
      setRuns([]);
      setResults([]);
      setSelectedRun(null);
      return;
    }

    loadingEvaluations.add(evaluationId);
    setDetailsLoading(true);
    setTestCases([]);
    setCriteria([]);
    setRuns([]);
    setResults([]);
    setSelectedRun(null);

    try {
      // 使用新 API 获取评测详情（包含所有关联数据）
      const evaluation = await evaluationsApi.getById(evaluationId);

      const loadedTestCases = (evaluation.testCases || []).map(tc => ({
        ...tc,
        attachments: (tc.attachments as FileAttachment[]) || [],
        notes: tc.notes || null,
      })) as TestCase[];
      const loadedCriteria = (evaluation.criteria || []) as EvaluationCriterion[];
      const loadedRuns = (evaluation.runs || []) as EvaluationRun[];

      let loadedResults: TestCaseResult[] = [];
      let loadedSelectedRunId: string | null = null;

      if (loadedRuns.length > 0) {
        const latestCompletedRun = loadedRuns.find(r => r.status === 'completed');
        if (latestCompletedRun) {
          loadedSelectedRunId = latestCompletedRun.id;
          loadedResults = await runsApi.getResults(latestCompletedRun.id);
        }
      }

      // 存入缓存
      evaluationCache.set(evaluationId, {
        testCases: loadedTestCases,
        criteria: loadedCriteria,
        runs: loadedRuns,
        results: loadedResults,
        selectedRunId: loadedSelectedRunId,
      });

      // 只有当前选中的评测还是这个时才更新状态
      if (selectedEvaluationIdRef.current === evaluationId) {
        setTestCases(loadedTestCases);
        setCriteria(loadedCriteria);
        setRuns(loadedRuns);
        setResults(loadedResults);
        setSelectedRun(loadedRuns.find(r => r.id === loadedSelectedRunId) || null);
      }
    } catch (error) {
      console.error('Failed to load evaluation details:', error);
    } finally {
      loadingEvaluations.delete(evaluationId);
      if (selectedEvaluationIdRef.current === evaluationId) {
        setDetailsLoading(false);
      }
    }
  }, []);

  // 只在 selectedEvaluation.id 变化时重新加载，避免 status 变化触发重载覆盖数据
  const selectedEvaluationId = selectedEvaluation?.id;
  useEffect(() => {
    if (selectedEvaluationId) {
      setHasDraftChanges(evaluationDraftDirty.has(selectedEvaluationId));
      loadEvaluationDetails(selectedEvaluationId);
    } else {
      setTestCases([]);
      setCriteria([]);
      setResults([]);
      setRuns([]);
      setSelectedRun(null);
      setHasDraftChanges(false);
    }
  }, [selectedEvaluationId, loadEvaluationDetails]);

  // 同步评测配置中的模型参数到 evalModelConfig
  useEffect(() => {
    if (selectedEvaluation?.config?.model_parameters) {
      const params = selectedEvaluation.config.model_parameters;
      setEvalModelConfig({
        temperature: params.temperature ?? DEFAULT_PROMPT_CONFIG.temperature,
        top_p: params.top_p ?? DEFAULT_PROMPT_CONFIG.top_p,
        frequency_penalty: params.frequency_penalty ?? DEFAULT_PROMPT_CONFIG.frequency_penalty,
        presence_penalty: params.presence_penalty ?? DEFAULT_PROMPT_CONFIG.presence_penalty,
        max_tokens: params.max_tokens ?? DEFAULT_PROMPT_CONFIG.max_tokens,
        reasoning: DEFAULT_PROMPT_CONFIG.reasoning,
      });
    } else {
      setEvalModelConfig(DEFAULT_PROMPT_CONFIG);
    }
  }, [selectedEvaluationId]);

  const loadData = async () => {
    // 检查是否有 prompts 更新（精确更新缓存，而不是全量刷新）
    if (cacheEvents.hasPendingUpdates('prompts')) {
      const updatedPrompts = cacheEvents.consumePendingUpdates('prompts') as Prompt[];
      if (listCache && updatedPrompts.length > 0) {
        const existingIds = new Set(listCache.prompts.map((p) => p.id));
        const updatedById = new Map(updatedPrompts.map((p) => [p.id, p]));
        const merged = listCache.prompts.map((p) => updatedById.get(p.id) || p);

        for (const [id, prompt] of updatedById) {
          if (!existingIds.has(id)) {
            merged.unshift(prompt);
          }
        }

        listCache.prompts = merged;
      }
    }

    // 如果有缓存，先使用缓存
    if (listCache) {
      setEvaluations(listCache.evaluations);
      setPrompts(listCache.prompts);
      setPromptGroups(listCache.promptGroups);
      setModels(listCache.models);
      setProviders(listCache.providers);
      if (listCache.evaluations.length > 0 && !selectedEvaluation) {
        setSelectedEvaluation(listCache.evaluations[0]);
      }
      setListLoading(false);
      return;
    }

    setListLoading(true);
    try {
      // 并行加载所有数据
      const [evalsData, promptsData, promptGroupsData, modelsData, providersData] = await Promise.all([
        evaluationsApi.list(),
        promptsApi.list(),
        promptGroupsApi.list(),
        modelsApi.list(),
        providersApi.list(),
      ]);

      const loadedEvaluations = (evalsData || []) as EvaluationWithRelations[];
      const loadedPrompts = (promptsData || []) as Prompt[];
      const loadedPromptGroups = (promptGroupsData || []) as PromptGroup[];
      const loadedModels = (modelsData || []) as Model[];
      const loadedProviders = (providersData || []).filter(p => p.enabled) as Provider[];

      // 保存到缓存
      listCache = {
        evaluations: loadedEvaluations,
        prompts: loadedPrompts,
        promptGroups: loadedPromptGroups,
        models: loadedModels,
        providers: loadedProviders,
      };

      setEvaluations(loadedEvaluations);
      setPrompts(loadedPrompts);
      setPromptGroups(loadedPromptGroups);
      setModels(loadedModels);
      setProviders(loadedProviders);

      if (loadedEvaluations.length > 0 && !selectedEvaluation) {
        setSelectedEvaluation(loadedEvaluations[0]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setListLoading(false);
    }
  };

  // 更新缓存的辅助函数
  const updateEvaluationCache = (evaluationId: string, updates: Partial<EvaluationCacheData>) => {
    const cached = evaluationCache.get(evaluationId);
    if (cached) {
      evaluationCache.set(evaluationId, { ...cached, ...updates });
    }
  };

  // 清除缓存
  const markEvaluationDirty = (evaluationId: string) => {
    evaluationDraftDirty.add(evaluationId);
    if (selectedEvaluationIdRef.current === evaluationId) {
      setHasDraftChanges(true);
    }
  };

  const clearEvaluationDirty = (evaluationId: string) => {
    evaluationDraftDirty.delete(evaluationId);
    if (selectedEvaluationIdRef.current === evaluationId) {
      setHasDraftChanges(false);
    }
  };

  const clearEvaluationCache = (evaluationId: string) => {
    evaluationCache.delete(evaluationId);
  };

  // 更新列表缓存
  const updateListCache = (updates: Partial<ListCache>) => {
    if (listCache) {
      listCache = { ...listCache, ...updates };
    }
  };

  const handleCreateEvaluation = async () => {
    if (!newEvalName.trim()) return;
    try {
      const data = await evaluationsApi.create({
        name: newEvalName.trim(),
        promptId: newEvalPrompt || undefined,
        modelId: newEvalModel || undefined,
        judgeModelId: newEvalJudgeModel || undefined,
        config: { pass_threshold: 0.6 },
      });

      const newEvaluations = [data as EvaluationWithRelations, ...evaluations];
      updateListCache({ evaluations: newEvaluations });
      setEvaluations(newEvaluations);
      setSelectedEvaluation(data as EvaluationWithRelations);
      setNewEvalName('');
      setNewEvalPrompt('');
      setNewEvalModel('');
      setNewEvalJudgeModel('');
      setShowNewEval(false);
      showToast('success', t('evaluationCreated'));
    } catch (e) {
      showToast('error', t('createFailed') + ': ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  const handleAddTestCase = async () => {
    if (!selectedEvaluation) return;

    const newTestCase: TestCase = {
      id: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      evaluationId: selectedEvaluation.id,
      name: '',
      inputText: '',
      inputVariables: {},
      attachments: [],
      expectedOutput: null,
      notes: null,
      orderIndex: testCases.length,
      createdAt: new Date().toISOString(),
    };

    const newTestCases = [...testCases, newTestCase];
    setTestCases(newTestCases);
    updateEvaluationCache(selectedEvaluation.id, { testCases: newTestCases });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleUpdateTestCase = async (testCase: TestCase) => {
    if (!selectedEvaluation) return;

    const newTestCases = testCases.map((tc) => (tc.id === testCase.id ? testCase : tc));
    setTestCases(newTestCases);
    updateEvaluationCache(selectedEvaluation.id, { testCases: newTestCases });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleDeleteTestCase = async (id: string) => {
    if (!selectedEvaluation) return;

    const newTestCases = testCases
      .filter((tc) => tc.id !== id)
      .map((tc, idx) => ({ ...tc, orderIndex: idx }));
    setTestCases(newTestCases);
    updateEvaluationCache(selectedEvaluation.id, { testCases: newTestCases });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleAddCriterion = async (
    criterion: Omit<EvaluationCriterion, 'id' | 'evaluationId' | 'createdAt'>
  ) => {
    if (!selectedEvaluation) return;

    const newCriterion: EvaluationCriterion = {
      id: `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      evaluationId: selectedEvaluation.id,
      name: criterion.name,
      description: criterion.description || null,
      prompt: criterion.prompt || null,
      weight: criterion.weight,
      enabled: criterion.enabled,
      createdAt: new Date().toISOString(),
    };

    const newCriteria = [...criteria, newCriterion];
    setCriteria(newCriteria);
    updateEvaluationCache(selectedEvaluation.id, { criteria: newCriteria });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleUpdateCriterion = async (criterion: EvaluationCriterion) => {
    if (!selectedEvaluation) return;

    const newCriteria = criteria.map((c) => (c.id === criterion.id ? criterion : c));
    setCriteria(newCriteria);
    updateEvaluationCache(selectedEvaluation.id, { criteria: newCriteria });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleDeleteCriterion = async (id: string) => {
    if (!selectedEvaluation) return;

    const newCriteria = criteria.filter((c) => c.id !== id);
    setCriteria(newCriteria);
    updateEvaluationCache(selectedEvaluation.id, { criteria: newCriteria });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleSelectRun = async (run: EvaluationRun) => {
    if (!selectedEvaluation) return;

    setSelectedRun(run);
    try {
      const resultsData = await runsApi.getResults(run.id);
      setResults(resultsData);
      updateEvaluationCache(selectedEvaluation.id, { results: resultsData, selectedRunId: run.id });
    } catch (e) {
      console.error('Failed to load run results:', e);
    }
    setActiveTab('results');
  };

  const runEvaluation = async () => {
    if (!selectedEvaluation) return;
    if (hasDraftChanges) {
      showToast('error', t('submitNewVersionToRun'));
      return;
    }
    if (testCases.length === 0) {
      showToast('error', t('addTestCasesFirst'));
      return;
    }
    if (!selectedEvaluation.modelId) {
      showToast('error', t('selectModelFirst'));
      return;
    }

    const model = models.find((m) => m.id === selectedEvaluation.modelId);
    const provider = providers.find((p) => p.id === model?.providerId);
    const prompt = prompts.find((p) => p.id === selectedEvaluation.promptId);

    if (!model || !provider) {
      showToast('error', t('modelOrProviderNotFound'));
      return;
    }

    const evalId = selectedEvaluation.id;
    const evalConfig = selectedEvaluation.config;
    const judgeModelId = selectedEvaluation.judgeModelId;
    const currentTestCases = [...testCases];
    const enabledCriteria = criteria.filter((c) => c.enabled);
    // 获取当前的模型参数
    const modelParams = evalConfig.model_parameters;

    showToast('info', t('evaluationStarted'));
    setActiveTab('history');
    setRunningCount(prev => prev + 1);

    let runData: EvaluationRun;
    try {
      runData = await runsApi.create(evalId, modelParams ? modelParams as Record<string, unknown> : undefined);
    } catch {
      showToast('error', t('createExecutionRecordFailed'));
      setRunningCount(prev => Math.max(0, prev - 1));
      return;
    }

    const currentRun = runData;
    // 更新状态并同步更新缓存，避免缓存数据覆盖新 run
    setRuns(prev => {
      const newRuns = [currentRun, ...prev];
      // 同步更新缓存
      const cached = evaluationCache.get(evalId);
      if (cached) {
        evaluationCache.set(evalId, { ...cached, runs: newRuns });
      }
      return newRuns;
    });
    setSelectedRun(currentRun);

    const abortController = { aborted: false };
    abortControllersRef.current.set(currentRun.id, abortController);

    try {
      await evaluationsApi.update(evalId, { status: 'running' });
    } catch (e) {
      console.error('Failed to update evaluation status:', e);
    }

    setSelectedEvaluation((prev) => prev?.id === evalId ? { ...prev, status: 'running' } : prev);
    setEvaluations((prev) =>
      prev.map((e) =>
        e.id === evalId ? { ...e, status: 'running' as EvaluationStatus } : e
      )
    );

    (async () => {
      const newResults: TestCaseResult[] = [];
      const allScores: Record<string, number[]> = {};

      for (const testCase of currentTestCases) {
        if (abortController.aborted) {
          break;
        }
        try {
          let systemPrompt = '';
          let userMessage = '';

          if (prompt) {
            systemPrompt = prompt.content || '';
            const vars = { ...testCase.inputVariables };

            for (const [key, value] of Object.entries(vars)) {
              systemPrompt = systemPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
            }

            if (systemPrompt.includes('{{input}}')) {
              systemPrompt = systemPrompt.replace(/{{input}}/g, testCase.inputText || '');
            } else {
              userMessage = testCase.inputText || '';
            }
          } else {
            userMessage = testCase.inputText || '';
          }

          const finalPrompt = userMessage ? `${systemPrompt}\n\n${userMessage}`.trim() : systemPrompt;

          const files: FileAttachment[] = testCase.attachments || [];
          const fileProcessing = evalConfig.file_processing || 'auto';
          const includeFiles = fileProcessing !== 'none' && (fileProcessing !== 'vision' || model.supportsVision);

          // Build user message content with attachments
          let userContent: string | ContentPart[] = finalPrompt;
          if (files.length > 0 && includeFiles) {
            const contentParts: ContentPart[] = [
              { type: 'text' as const, text: finalPrompt }
            ];
            for (const file of files) {
              contentParts.push({
                type: 'file_ref' as const,
                file_ref: { fileId: file.fileId },
              });
            }
            userContent = contentParts;
          }

          const aiResponse = await chatApi.complete({
            modelId: model.id,
            messages: [{ role: 'user', content: userContent }],
            temperature: modelParams?.temperature,
            top_p: modelParams?.top_p,
            max_tokens: modelParams?.max_tokens,
            frequency_penalty: modelParams?.frequency_penalty,
            presence_penalty: modelParams?.presence_penalty,
            saveTrace: false,
            isEvalCase: true,
            fileProcessing,
            ocrProvider: evalConfig.ocr_provider,
          });

          const scores: Record<string, number> = {};
          const aiFeedback: Record<string, string> = {};

          if (enabledCriteria.length > 0 && judgeModelId) {
            const judgeModel = models.find((m) => m.id === judgeModelId);
            const judgeProvider = providers.find((p) => p.id === judgeModel?.providerId);

            if (judgeModel && judgeProvider) {
              for (const criterion of enabledCriteria) {
                try {
                  let evalPrompt = criterion.prompt || '';
                  evalPrompt = evalPrompt.replace(/{{input}}/g, testCase.inputText || '');
                  evalPrompt = evalPrompt.replace(/{{output}}/g, aiResponse.content);
                  if (testCase.expectedOutput) {
                    evalPrompt = evalPrompt.replace(/{{#expected}}[\s\S]*?{{\/expected}}/g,
                      evalPrompt.match(/{{#expected}}([\s\S]*?){{\/expected}}/)?.[1]?.replace(/{{expected}}/g, testCase.expectedOutput) || ''
                    );
                    evalPrompt = evalPrompt.replace(/{{expected}}/g, testCase.expectedOutput);
                  } else {
                    evalPrompt = evalPrompt.replace(/{{#expected}}[\s\S]*?{{\/expected}}/g, '');
                  }

                  const evalResponse = await chatApi.complete({
                    modelId: judgeModel.id,
                    messages: [{ role: 'user', content: evalPrompt }],
                    saveTrace: false,
                    isEvalCase: true,
                  });

                  const jsonMatch = evalResponse.content.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const score = Math.min(1, Math.max(0, (parsed.score || 0) / 10));
                    scores[criterion.name] = score;
                    aiFeedback[criterion.name] = parsed.reason || '';

                    if (!allScores[criterion.name]) allScores[criterion.name] = [];
                    allScores[criterion.name].push(score);
                  }
                } catch {
                  scores[criterion.name] = 0;
                  aiFeedback[criterion.name] = t('evaluationFailed');
                }
              }
            }
          }

          const avgScore = Object.keys(scores).length > 0
            ? Object.keys(scores).reduce((sum, name) => {
                const criterion = enabledCriteria.find(c => c.name === name);
                return sum + scores[name] * (criterion?.weight || 1);
              }, 0) / enabledCriteria.reduce((sum, c) => sum + c.weight, 0)
            : 1;
          const passed = avgScore >= (evalConfig.pass_threshold || 0.6);

          const result = {
            testCaseId: testCase.id,
            modelOutput: aiResponse.content,
            scores,
            aiFeedback: aiFeedback,
            latencyMs: aiResponse.latencyMs,
            tokensInput: aiResponse.usage.prompt_tokens,
            tokensOutput: aiResponse.usage.completion_tokens,
            passed,
            errorMessage: undefined,
          };

          try {
            const savedResult = await runsApi.addResult(currentRun.id, result);
            newResults.push(savedResult);
            setResults((prev) => [...prev, savedResult]);
          } catch (e) {
            console.error('Failed to save result:', e);
          }
        } catch (err) {
          const result = {
            testCaseId: testCase.id,
            modelOutput: '',
            scores: {},
            aiFeedback: {},
            latencyMs: 0,
            tokensInput: 0,
            tokensOutput: 0,
            passed: false,
            errorMessage: err instanceof Error ? err.message : t('unknownError'),
          };

          try {
            const savedResult = await runsApi.addResult(currentRun.id, result);
            newResults.push(savedResult);
            setResults((prev) => [...prev, savedResult]);
          } catch (e) {
            console.error('Failed to save error result:', e);
          }
        }
      }

      const overallScores: Record<string, number> = {};
      for (const [name, scoreList] of Object.entries(allScores)) {
        overallScores[name] = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
      }

      if (abortController.aborted) {
        abortControllersRef.current.delete(currentRun.id);
        return;
      }

      const passedCount = newResults.filter((r) => r.passed).length;
      const totalTokensInput = newResults.reduce((sum, r) => sum + (r.tokensInput || 0), 0);
      const totalTokensOutput = newResults.reduce((sum, r) => sum + (r.tokensOutput || 0), 0);
      const evalResults = {
        scores: overallScores,
        totalCases: currentTestCases.length,
        passedCases: passedCount,
        summary: t('summaryTemplate', { total: currentTestCases.length, passed: passedCount, rate: ((passedCount / currentTestCases.length) * 100).toFixed(0) }),
      };

      // Update run status (note: may need backend API support)
      setRuns(prev => prev.map(r =>
        r.id === currentRun.id
          ? { ...r, status: 'completed' as EvaluationStatus, results: evalResults, totalTokensInput, totalTokensOutput, completedAt: new Date().toISOString() }
          : r
      ));
      setSelectedRun(prev =>
        prev?.id === currentRun.id
          ? { ...prev, status: 'completed', results: evalResults, totalTokensInput, totalTokensOutput, completedAt: new Date().toISOString() }
          : prev
      );

      // Update evaluation status
      try {
        await evaluationsApi.update(evalId, {
          status: 'completed',
          results: evalResults,
        });
      } catch (e) {
        console.error('Failed to update evaluation:', e);
      }

      setSelectedEvaluation((prev) =>
        prev?.id === evalId ? { ...prev, status: 'completed', results: evalResults } : prev
      );
      setEvaluations((prev) =>
        prev.map((e) =>
          e.id === evalId
            ? { ...e, status: 'completed' as EvaluationStatus, results: evalResults }
            : e
        )
      );

      // 清除缓存，确保下次加载时获取最新数据
      clearEvaluationCache(evalId);

      abortControllersRef.current.delete(currentRun.id);
      setRunningCount(prev => Math.max(0, prev - 1));
      showToast('success', t('evaluationComplete'));
    })();
  };

  // 单用例评测
  const handleRunSingleTestCase = async (testCase: TestCase) => {
    if (!selectedEvaluation) return;
    if (hasDraftChanges) {
      showToast('error', t('submitNewVersionToRun'));
      return;
    }
    if (!selectedEvaluation.modelId) {
      showToast('error', t('selectModelFirst'));
      return;
    }

    const model = models.find((m) => m.id === selectedEvaluation.modelId);
    const provider = providers.find((p) => p.id === model?.providerId);
    const prompt = prompts.find((p) => p.id === selectedEvaluation.promptId);

    if (!model || !provider) {
      showToast('error', t('modelOrProviderNotFound'));
      return;
    }

    const evalId = selectedEvaluation.id;
    const evalConfig = selectedEvaluation.config;
    const judgeModelId = selectedEvaluation.judgeModelId;
    const enabledCriteria = criteria.filter((c) => c.enabled);
    // 获取当前的模型参数
    const modelParams = evalConfig.model_parameters;

    setRunningTestCaseId(testCase.id);

    // 创建执行记录
    let runData: EvaluationRun;
    try {
      runData = await runsApi.create(evalId, modelParams ? modelParams as Record<string, unknown> : undefined);
    } catch {
      showToast('error', t('createExecutionRecordFailed'));
      setRunningTestCaseId(null);
      return;
    }

    const currentRun = runData;
    // 更新状态并同步更新缓存
    setRuns(prev => {
      const newRuns = [currentRun, ...prev];
      const cached = evaluationCache.get(evalId);
      if (cached) {
        evaluationCache.set(evalId, { ...cached, runs: newRuns });
      }
      return newRuns;
    });

    try {
      let systemPrompt = '';
      let userMessage = '';

      if (prompt) {
        systemPrompt = prompt.content || '';
        const vars = { ...testCase.inputVariables };

        for (const [key, value] of Object.entries(vars)) {
          systemPrompt = systemPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        if (systemPrompt.includes('{{input}}')) {
          systemPrompt = systemPrompt.replace(/{{input}}/g, testCase.inputText || '');
        } else {
          userMessage = testCase.inputText || '';
        }
      } else {
        userMessage = testCase.inputText || '';
      }

      const finalPrompt = userMessage ? `${systemPrompt}\n\n${userMessage}`.trim() : systemPrompt;

      const files: FileAttachment[] = testCase.attachments || [];
      const fileProcessing = evalConfig.file_processing || 'auto';
      const includeFiles = fileProcessing !== 'none' && (fileProcessing !== 'vision' || model.supportsVision);

      // Build user message content with attachments
      let userContent: string | ContentPart[] = finalPrompt;
      if (files.length > 0 && includeFiles) {
        const contentParts: ContentPart[] = [
          { type: 'text' as const, text: finalPrompt }
        ];
        for (const file of files) {
          contentParts.push({
            type: 'file_ref' as const,
            file_ref: { fileId: file.fileId },
          });
        }
        userContent = contentParts;
      }

      const startTime = Date.now();
      const aiResult = await chatApi.complete({
        modelId: model.id,
        messages: [{ role: 'user', content: userContent }],
        temperature: modelParams?.temperature,
        top_p: modelParams?.top_p,
        max_tokens: modelParams?.max_tokens,
        frequency_penalty: modelParams?.frequency_penalty,
        presence_penalty: modelParams?.presence_penalty,
        saveTrace: false,
        isEvalCase: true,
        fileProcessing,
        ocrProvider: evalConfig.ocr_provider,
      });

      const latency = Date.now() - startTime;
      const scores: Record<string, number> = {};
      const aiFeedback: Record<string, string> = {};
      let passed = true;

      // AI 评判（与批量评测逻辑保持一致）
      if (enabledCriteria.length > 0 && judgeModelId) {
        const judgeModel = models.find((m) => m.id === judgeModelId);
        const judgeProvider = providers.find((p) => p.id === judgeModel?.providerId);

        if (judgeModel && judgeProvider) {
          for (const criterion of enabledCriteria) {
            try {
              let evalPrompt = criterion.prompt || '';
              evalPrompt = evalPrompt.replace(/{{input}}/g, testCase.inputText || '');
              evalPrompt = evalPrompt.replace(/{{output}}/g, aiResult.content);
              if (testCase.expectedOutput) {
                evalPrompt = evalPrompt.replace(/{{#expected}}[\s\S]*?{{\/expected}}/g,
                  evalPrompt.match(/{{#expected}}([\s\S]*?){{\/expected}}/)?.[1]?.replace(/{{expected}}/g, testCase.expectedOutput) || ''
                );
                evalPrompt = evalPrompt.replace(/{{expected}}/g, testCase.expectedOutput);
              } else {
                evalPrompt = evalPrompt.replace(/{{#expected}}[\s\S]*?{{\/expected}}/g, '');
              }

              const evalResponse = await chatApi.complete({
                modelId: judgeModel.id,
                messages: [{ role: 'user', content: evalPrompt }],
                saveTrace: false,
                isEvalCase: true,
              });

              const jsonMatch = evalResponse.content.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const score = Math.min(1, Math.max(0, (parsed.score || 0) / 10));
                scores[criterion.name] = score;
                aiFeedback[criterion.name] = parsed.reason || '';
              }
            } catch (error) {
              console.error('Judge error:', error);
              scores[criterion.name] = 0;
              aiFeedback[criterion.name] = t('evaluationFailed');
            }
          }

          // 判断是否通过（使用加权平均，与批量评测一致）
          const avgScore = Object.keys(scores).length > 0
            ? Object.keys(scores).reduce((sum, name) => {
                const criterion = enabledCriteria.find(c => c.name === name);
                return sum + scores[name] * (criterion?.weight || 1);
              }, 0) / enabledCriteria.reduce((sum, c) => sum + c.weight, 0)
            : 1;
          passed = avgScore >= (evalConfig?.pass_threshold || 0.6);
        }
      }

      // 保存结果
      const resultData = {
        testCaseId: testCase.id,
        modelOutput: aiResult.content,
        scores,
        aiFeedback: aiFeedback,
        latencyMs: latency,
        tokensInput: aiResult.usage?.prompt_tokens || 0,
        tokensOutput: aiResult.usage?.completion_tokens || 0,
        passed,
      };

      let savedResult: TestCaseResult | null = null;
      try {
        savedResult = await runsApi.addResult(currentRun.id, resultData);
      } catch (e) {
        console.error('Failed to save result:', e);
      }

      const newResults = savedResult ? [savedResult] : [];

      // 计算总分
      const overallScores: Record<string, number> = {};
      for (const criterion of enabledCriteria) {
        if (scores[criterion.name] !== undefined) {
          overallScores[criterion.name] = scores[criterion.name];
        }
      }

      const evalResults = {
        passedCases: passed ? 1 : 0,
        totalCases: 1,
        scores: overallScores,
        summary: t('singleTestComplete') + ', ' + (passed ? t('passed') : t('notPassed')),
      };

      // 更新运行记录 (local state only, backend update may need API support)
      const completedRun: EvaluationRun = {
        ...currentRun,
        status: 'completed',
        results: evalResults,
        totalTokensInput: aiResult.usage?.prompt_tokens || 0,
        totalTokensOutput: aiResult.usage?.completion_tokens || 0,
        completedAt: new Date().toISOString(),
      };

      setRuns(prev => {
        const newRuns = prev.map(r => r.id === currentRun.id ? completedRun : r);
        const cached = evaluationCache.get(evalId);
        if (cached) {
          evaluationCache.set(evalId, { ...cached, runs: newRuns });
        }
        return newRuns;
      });
      setResults(newResults);
      setSelectedRun(completedRun);
      setActiveTab('results');

      showToast('success', t('singleTestComplete') + ', ' + (passed ? t('passed') : t('notPassed')));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('evaluationExecutionFailed');

      // 保存错误结果
      const errorResult = {
        testCaseId: testCase.id,
        modelOutput: '',
        scores: {},
        aiFeedback: {},
        latencyMs: 0,
        tokensInput: 0,
        tokensOutput: 0,
        passed: false,
        errorMessage: errorMessage,
      };

      try {
        await runsApi.addResult(currentRun.id, errorResult);
      } catch (e) {
        console.error('Failed to save error result:', e);
      }

      const failedRun: EvaluationRun = {
        ...currentRun,
        status: 'failed',
        errorMessage: errorMessage,
        completedAt: new Date().toISOString(),
      };

      setRuns(prev => {
        const newRuns = prev.map(r => r.id === currentRun.id ? failedRun : r);
        const cached = evaluationCache.get(evalId);
        if (cached) {
          evaluationCache.set(evalId, { ...cached, runs: newRuns });
        }
        return newRuns;
      });

      showToast('error', errorMessage);
    } finally {
      setRunningTestCaseId(null);
    }
  };

  const handleStopRun = async (runId: string) => {
    const controller = abortControllersRef.current.get(runId);
    if (controller) {
      controller.aborted = true;
      abortControllersRef.current.delete(runId);
    }

    const run = runs.find(r => r.id === runId);
    if (!run) return;

    const errorMessage = t('evaluationAborted');

    // Update local state (backend update via API if available)
    try {
      await evaluationsApi.update(run.evaluationId, { status: 'failed' });
    } catch (e) {
      console.error('Failed to update evaluation status:', e);
    }

    setRuns(prev => prev.map(r =>
      r.id === runId
        ? { ...r, status: 'failed' as EvaluationStatus, errorMessage: errorMessage, completedAt: new Date().toISOString() }
        : r
    ));

    setSelectedRun(prev =>
      prev?.id === runId
        ? { ...prev, status: 'failed', errorMessage: errorMessage, completedAt: new Date().toISOString() }
        : prev
    );

    if (selectedEvaluation?.id === run.evaluationId) {
      setSelectedEvaluation(prev => prev ? { ...prev, status: 'failed' } : prev);
    }
    setEvaluations(prev =>
      prev.map((e) => (e.id === run.evaluationId ? { ...e, status: 'failed' as EvaluationStatus } : e))
    );

    if (controller) {
      setRunningCount(prev => Math.max(0, prev - 1));
    }

    // 清除缓存
    clearEvaluationCache(run.evaluationId);

    showToast('info', t('evaluationStopped'));
  };

  const handleDeleteRun = async (runId: string) => {
    if (!selectedEvaluation) return;

    try {
      await runsApi.delete(runId);

      const newRuns = runs.filter((r) => r.id !== runId);
      const newResults = results.filter((r) => r.runId !== runId);

      setRuns(newRuns);
      setResults(newResults);

      if (selectedRun?.id === runId) {
        setSelectedRun(newRuns[0] || null);
      }

      // 更新缓存
      updateEvaluationCache(selectedEvaluation.id, {
        runs: newRuns,
        results: newResults,
        selectedRunId: selectedRun?.id === runId ? (newRuns[0]?.id || null) : selectedRun?.id || null,
      });

      showToast('success', t('executionRecordDeleted'));
    } catch {
      showToast('error', t('deleteExecutionRecordFailed'));
    }
  };

  const handleDeleteEvaluation = async () => {
    if (!selectedEvaluation) return;
    try {
      const evalIdToDelete = selectedEvaluation.id;
      await evaluationsApi.delete(evalIdToDelete);

      // 清除缓存
      clearEvaluationCache(evalIdToDelete);

      const remaining = evaluations.filter((e) => e.id !== evalIdToDelete);
      updateListCache({ evaluations: remaining });
      setEvaluations(remaining);
      setSelectedEvaluation(remaining[0] || null);
      showToast('success', t('evaluationDeleted'));
    } catch (e) {
      showToast('error', t('deleteFailed') + ': ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  const handleCopyEvaluation = async () => {
    if (!selectedEvaluation) return;
    setSubmittingNewVersion(true);
    try {
      const sourceId = selectedEvaluation.id;

      const newEval = await evaluationsApi.create({
        name: `${selectedEvaluation.name} (${t('copy')})`,
        promptId: selectedEvaluation.promptId || undefined,
        modelId: selectedEvaluation.modelId || undefined,
        judgeModelId: selectedEvaluation.judgeModelId || undefined,
        config: selectedEvaluation.config,
        testCases: testCases.map((tc, idx) => ({
          name: tc.name || undefined,
          inputText: tc.inputText || '',
          inputVariables: tc.inputVariables || {},
          attachments: tc.attachments || [],
          expectedOutput: tc.expectedOutput ?? undefined,
          notes: tc.notes ?? undefined,
          orderIndex: idx,
        })),
        criteria: criteria.map((c) => ({
          name: c.name,
          description: c.description || undefined,
          prompt: c.prompt || undefined,
          weight: c.weight,
          enabled: c.enabled,
        })),
      });

      const newEvaluations = [newEval as EvaluationWithRelations, ...evaluations];
      updateListCache({ evaluations: newEvaluations });
      setEvaluations(newEvaluations);
      setSelectedEvaluation(newEval as EvaluationWithRelations);

      // Clear draft state for the source evaluation (edits are captured in the new version).
      clearEvaluationDirty(sourceId);
      clearEvaluationCache(sourceId);

      showToast('success', t('evaluationCopied'));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('copyEvaluationFailed'));
    } finally {
      setSubmittingNewVersion(false);
    }
  };

  const handleUpdateEvaluation = async (field: string, value: string | null) => {
    if (!selectedEvaluation) return;

    const updated = { ...selectedEvaluation, [field]: value } as EvaluationWithRelations;
    setSelectedEvaluation(updated);
    setEvaluations((prev) => {
      const next = prev.map((e) => (e.id === selectedEvaluation.id ? updated : e));
      updateListCache({ evaluations: next });
      return next;
    });
    markEvaluationDirty(selectedEvaluation.id);
  };

  const handleUpdateConfig = async <K extends keyof EvaluationConfig>(key: K, value: EvaluationConfig[K]) => {
    if (!selectedEvaluation) return;

    const newConfig: EvaluationConfig = { ...selectedEvaluation.config, [key]: value };
    if (value === undefined) {
      delete (newConfig as Record<string, unknown>)[key as string];
    }

    const updated = { ...selectedEvaluation, config: newConfig } as EvaluationWithRelations;
    setSelectedEvaluation(updated);
    setEvaluations((prev) => {
      const next = prev.map((e) => (e.id === selectedEvaluation.id ? updated : e));
      updateListCache({ evaluations: next });
      return next;
    });
    markEvaluationDirty(selectedEvaluation.id);
  };

  // 处理模型参数变更
  const handleModelParametersChange = async (newConfig: PromptConfig) => {
    setEvalModelConfig(newConfig);
    const modelParams: ModelParameters = {
      temperature: newConfig.temperature,
      top_p: newConfig.top_p,
      frequency_penalty: newConfig.frequency_penalty,
      presence_penalty: newConfig.presence_penalty,
      max_tokens: newConfig.max_tokens,
    };
    await handleUpdateConfig('model_parameters', modelParams);
    await handleUpdateConfig('inherited_from_prompt', false);
  };

  // 处理关联 Prompt 变更时继承参数
  const handlePromptChange = async (promptId: string | null) => {
    await handleUpdateEvaluation('promptId', promptId);

    if (promptId) {
      const prompt = prompts.find(p => p.id === promptId);
      if (prompt?.config) {
        const newConfig: PromptConfig = {
          temperature: prompt.config.temperature ?? DEFAULT_PROMPT_CONFIG.temperature,
          top_p: prompt.config.top_p ?? DEFAULT_PROMPT_CONFIG.top_p,
          frequency_penalty: prompt.config.frequency_penalty ?? DEFAULT_PROMPT_CONFIG.frequency_penalty,
          presence_penalty: prompt.config.presence_penalty ?? DEFAULT_PROMPT_CONFIG.presence_penalty,
          max_tokens: prompt.config.max_tokens ?? DEFAULT_PROMPT_CONFIG.max_tokens,
          reasoning: prompt.config.reasoning ?? DEFAULT_PROMPT_CONFIG.reasoning,
        };
        setEvalModelConfig(newConfig);
        const modelParams: ModelParameters = {
          temperature: newConfig.temperature,
          top_p: newConfig.top_p,
          frequency_penalty: newConfig.frequency_penalty,
          presence_penalty: newConfig.presence_penalty,
          max_tokens: newConfig.max_tokens,
        };
        await handleUpdateConfig('model_parameters', modelParams);
        await handleUpdateConfig('inherited_from_prompt', true);
      }
    }
  };

  const startEditingName = () => {
    if (selectedEvaluation) {
      setEditingName(selectedEvaluation.name);
      setIsEditingName(true);
    }
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setEditingName('');
  };

  const saveEvaluationName = async () => {
    if (!selectedEvaluation || !editingName.trim()) {
      showToast('error', t('nameCannotBeEmpty'));
      return;
    }

    await handleUpdateEvaluation('name', editingName.trim());
    setIsEditingName(false);
    setEditingName('');
  };

  const selectedPrompt = prompts.find((p) => p.id === selectedEvaluation?.promptId);
  const promptVariables = (selectedPrompt?.variables as PromptVariable[] | undefined)?.map((v) => v.name) || [];

  return (
    <div className="h-full flex overflow-hidden bg-slate-950 light:bg-slate-50">
      <div className="w-80 bg-slate-900/50 light:bg-white border-r border-slate-700 light:border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-700 light:border-slate-200 flex-shrink-0">
          <Button className="w-full" onClick={() => setShowNewEval(true)}>
            <Plus className="w-4 h-4" />
            <span>{t('newEvaluation')}</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {listLoading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-700 light:border-slate-200 animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-slate-700 light:bg-slate-200 rounded mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 bg-slate-700 light:bg-slate-200 rounded" />
                      <div className="h-5 w-16 bg-slate-700 light:bg-slate-200 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <>
          {evaluations.map((evaluation) => {
            const status = statusConfig[evaluation.status];
            return (
              <button
                key={evaluation.id}
                onClick={() => setSelectedEvaluation(evaluation)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                  selectedEvaluation?.id === evaluation.id
                    ? 'bg-slate-800 light:bg-cyan-50 border border-slate-600 light:border-cyan-200'
                    : 'hover:bg-slate-800/50 light:hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-5 h-5 text-slate-500 light:text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 light:text-slate-800 truncate">
                    {evaluation.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                  </div>
                </div>
              </button>
            );
          })}
          {evaluations.length === 0 && !listLoading && (
            <div className="text-center py-8 text-slate-500 light:text-slate-400 text-sm">
              {t('noEvaluations')}
            </div>
          )}
          </>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedEvaluation ? (
          <>
            {/* Header - fixed */}
            <div className="flex-shrink-0 p-6 pb-0 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEvaluationName();
                          if (e.key === 'Escape') cancelEditingName();
                        }}
                        className="max-w-md"
                        autoFocus
                      />
                      <Button size="sm" onClick={saveEvaluationName}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditingName}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-white light:text-slate-900">
                        {selectedEvaluation.name}
                      </h2>
                      {hasDraftChanges && (
                        <Badge variant="warning">{t('draftChanges')}</Badge>
                      )}
                      <button
                        onClick={startEditingName}
                        className="p-1 hover:bg-slate-700 light:hover:bg-slate-200 rounded transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-slate-400 light:text-slate-500" />
                      </button>
                      <button
                        onClick={async () => {
                          // Check if prompt is public when trying to make evaluation public
                          const linkedPrompt = prompts.find(p => p.id === selectedEvaluation.promptId);
                          if (!selectedEvaluation.isPublic && linkedPrompt && !linkedPrompt.isPublic) {
                            showToast('error', t('promptMustBePublicFirst'));
                            return;
                          }
                          const newValue = !selectedEvaluation.isPublic;
                          try {
                            await evaluationsApi.update(selectedEvaluation.id, { isPublic: newValue });
                            setSelectedEvaluation({ ...selectedEvaluation, isPublic: newValue });
                            setEvaluations((prev) => prev.map((e) => e.id === selectedEvaluation.id ? { ...e, isPublic: newValue } : e));
                            showToast('success', newValue ? t('evaluationPublic') : t('evaluationPrivate'));
                          } catch {
                            showToast('error', t('updateFailed'));
                          }
                        }}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          selectedEvaluation.isPublic
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600 light:bg-slate-200 light:text-slate-500 light:hover:bg-slate-300'
                        }`}
                        title={selectedEvaluation.isPublic ? t('clickToPrivate') : t('clickToPublic')}
                      >
                        <Globe className="w-3 h-3" />
                        {selectedEvaluation.isPublic ? t('public') : t('private')}
                      </button>
                    </div>
                  )}
                  <p className="text-sm text-slate-500 light:text-slate-400 mt-1">
                    {t('createdAt')} {formatDateTime(selectedEvaluation.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={runEvaluation} disabled={hasDraftChanges || submittingNewVersion}>
                    {runningCount > 0 ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>{t('runEvaluation')}</span>
                    {runningCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded">
                        {runningCount}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleCopyEvaluation}
                    loading={submittingNewVersion}
                  >
                    <Copy className="w-4 h-4" />
                    <span>{t('submitNewVersion')}</span>
                  </Button>
                  <Button variant="ghost" onClick={handleDeleteEvaluation} disabled={submittingNewVersion}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {hasDraftChanges && (
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 light:bg-amber-50 light:border-amber-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 light:text-amber-700 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-200 light:text-amber-800">
                    {t('draftChangesHint')}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-6 gap-4">
                <div className="p-4 bg-slate-800/50 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg light:shadow-sm">
                  <p className="text-xs text-slate-500 light:text-slate-600 mb-2">{t('linkedPrompt')}</p>
                  <PromptCascader
                    value={selectedEvaluation.promptId || null}
                    onChange={(promptId) => void handlePromptChange(promptId)}
                    prompts={prompts}
                    groups={promptGroups}
                    allowClear
                    clearLabel={t('noLinkedPrompt')}
                  />
                  {selectedPrompt && (
                    <p className="text-xs text-cyan-400 light:text-cyan-600 mt-2">
                      {t('currentVersion')}: v{selectedPrompt.currentVersion}
                    </p>
                  )}
                </div>
                <div className="p-4 bg-slate-800/50 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg light:shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 light:text-slate-600">{t('targetModel')}</p>
                    <button
                      onClick={() => setShowParamsModal(true)}
                      className="p-1 text-slate-400 hover:text-cyan-400 light:text-slate-500 light:hover:text-cyan-600 transition-colors rounded hover:bg-slate-700/50 light:hover:bg-slate-100"
                      title={t('modelParameters')}
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>
                  <ModelSelector
                    models={models}
                    providers={providers}
                    selectedModelId={selectedEvaluation.modelId || ''}
                    onSelect={(modelId) => handleUpdateEvaluation('modelId', modelId || null)}
                    placeholder={t('selectModel')}
                  />
                  {selectedEvaluation.model && (
                    <p className="text-xs text-slate-500 light:text-slate-600 mt-2">
                      {t('reproducibleModel')}: {selectedEvaluation.model.provider?.type ? `${selectedEvaluation.model.provider.type}/` : ''}{selectedEvaluation.model.modelId}
                    </p>
                  )}
                  {selectedEvaluation.config?.model_parameters && (
                    <p className="text-xs text-slate-500 light:text-slate-600 mt-1">
                      {t('modelParameters')}:&nbsp;
                      {selectedEvaluation.config.model_parameters.temperature !== undefined ? `T:${selectedEvaluation.config.model_parameters.temperature} ` : ''}
                      {selectedEvaluation.config.model_parameters.max_tokens !== undefined ? `Max:${selectedEvaluation.config.model_parameters.max_tokens} ` : ''}
                      {selectedEvaluation.config.model_parameters.top_p !== undefined ? `P:${selectedEvaluation.config.model_parameters.top_p} ` : ''}
                    </p>
                  )}
                  {selectedEvaluation.config.inherited_from_prompt && (
                    <p className="text-xs text-cyan-400 light:text-cyan-600 mt-1">
                      {t('inheritedFromPrompt')}
                    </p>
                  )}
                </div>
                <div className="p-4 bg-slate-800/50 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg light:shadow-sm">
                  <p className="text-xs text-slate-500 light:text-slate-600 mb-2">{t('judgeModel')}</p>
                  <ModelSelector
                    models={models}
                    providers={providers}
                    selectedModelId={selectedEvaluation.judgeModelId || ''}
                    onSelect={(modelId) => handleUpdateEvaluation('judgeModelId', modelId || null)}
                    placeholder={t('noJudgeModel')}
                  />
                  {selectedEvaluation.judgeModel && (
                    <p className="text-xs text-slate-500 light:text-slate-600 mt-2">
                      {t('reproducibleJudgeModel')}: {selectedEvaluation.judgeModel.provider?.type ? `${selectedEvaluation.judgeModel.provider.type}/` : ''}{selectedEvaluation.judgeModel.modelId}
                    </p>
                  )}
                </div>
                <div className="p-4 bg-slate-800/50 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg light:shadow-sm">
                  <p className="text-xs text-slate-500 light:text-slate-600 mb-2">{t('passThreshold')}</p>
                  <Select
                    value={String((selectedEvaluation.config.pass_threshold || 0.6) * 10)}
                    onChange={(e) => handleUpdateConfig('pass_threshold', Number(e.target.value) / 10)}
                    options={[
                      { value: '10', label: t('threshold10') },
                      { value: '9', label: t('threshold9') },
                      { value: '8', label: t('threshold8') },
                      { value: '7', label: t('threshold7') },
                      { value: '6', label: t('threshold6') },
                      { value: '5', label: t('threshold5') },
                      { value: '4', label: t('threshold4') },
                      { value: '3', label: t('threshold3') },
                      { value: '0', label: t('threshold0') },
                    ]}
                  />
                </div>
                <div className="p-4 bg-slate-800/50 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg light:shadow-sm">
                  <p className="text-xs text-slate-500 light:text-slate-600 mb-2">{t('fileProcessing')}</p>
                  <Select
                    value={selectedEvaluation.config.file_processing || 'auto'}
                    onChange={(e) => handleUpdateConfig('file_processing', e.target.value as EvaluationConfig['file_processing'])}
                    options={[
                      { value: 'auto', label: t('fileProcessingAuto') },
                      ...(currentModelInfo.supportsVision ? [{ value: 'vision', label: t('fileProcessingVision') }] : []),
                      { value: 'ocr', label: t('fileProcessingOcr') },
                      { value: 'none', label: t('fileProcessingNone') },
                    ]}
                  />
                  {(selectedEvaluation.config.file_processing === 'ocr' ||
                    ((selectedEvaluation.config.file_processing || 'auto') === 'auto' && !currentModelInfo.supportsVision)) && (
                    <div className="mt-2">
                      <Select
                        value={selectedEvaluation.config.ocr_provider || ''}
                        onChange={(e) => handleUpdateConfig('ocr_provider', (e.target.value ? (e.target.value as EvaluationConfig['ocr_provider']) : undefined))}
                        options={[
                          { value: '', label: t('ocrProviderFollow') },
                          { value: 'paddle', label: 'PaddleOCR' },
                          { value: 'paddle_vl', label: t('ocrProviderPaddleVl') },
                          { value: 'datalab', label: t('ocrProviderDatalab') },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <div className="p-4 bg-slate-800/50 light:bg-white border border-slate-700 light:border-slate-200 rounded-lg light:shadow-sm">
                  <p className="text-xs text-slate-500 light:text-slate-600 mb-1">{t('status')}</p>
                  <Badge variant={statusConfig[selectedEvaluation.status].variant}>
                    {t(statusConfig[selectedEvaluation.status].labelKey)}
                  </Badge>
                </div>
              </div>

              <div className="border-b border-slate-700 light:border-slate-200">
                <nav className="flex gap-4">
                  <button
                    onClick={() => setActiveTab('testcases')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'testcases'
                        ? 'border-cyan-500 text-cyan-400 light:text-cyan-600'
                        : 'border-transparent text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-800'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    {t('testCasesCount', { count: testCases.length })}
                  </button>
                  <button
                    onClick={() => setActiveTab('criteria')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'criteria'
                        ? 'border-cyan-500 text-cyan-400 light:text-cyan-600'
                        : 'border-transparent text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-800'
                    }`}
                  >
                    <Settings2 className="w-4 h-4" />
                    {t('criteriaCount', { count: criteria.filter((c) => c.enabled).length })}
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'history'
                        ? 'border-cyan-500 text-cyan-400 light:text-cyan-600'
                        : 'border-transparent text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-800'
                    }`}
                  >
                    <History className="w-4 h-4" />
                    {t('executionHistoryCount', { count: runs.length })}
                  </button>
                  <button
                    onClick={() => setActiveTab('results')}
                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'results'
                        ? 'border-cyan-500 text-cyan-400 light:text-cyan-600'
                        : 'border-transparent text-slate-500 light:text-slate-600 hover:text-slate-300 light:hover:text-slate-800'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    {t('resultsCount', { count: results.length })}
                  </button>
                </nav>
              </div>
            </div>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {detailsLoading ? (
                <div className="space-y-6">
                  {/* Loading indicator at top */}
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-400 light:text-slate-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('loadingDetails')}</span>
                  </div>
                  {/* Skeleton loading */}
                  <div className="animate-pulse space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="h-4 w-32 bg-slate-700 light:bg-slate-200 rounded" />
                      <div className="h-4 w-20 bg-slate-700 light:bg-slate-200 rounded" />
                    </div>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-4 border border-slate-700 light:border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="h-6 w-6 bg-slate-700 light:bg-slate-200 rounded-full" />
                          <div className="h-4 w-40 bg-slate-700 light:bg-slate-200 rounded" />
                        </div>
                        <div className="h-20 bg-slate-700/50 light:bg-slate-100 rounded" />
                        <div className="flex gap-2">
                          <div className="h-3 w-16 bg-slate-700 light:bg-slate-200 rounded" />
                          <div className="h-3 w-24 bg-slate-700 light:bg-slate-200 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
              <div>
                {activeTab === 'testcases' && (
                  <TestCaseList
                    testCases={testCases}
                    variables={promptVariables}
                    onAdd={handleAddTestCase}
                    onUpdate={handleUpdateTestCase}
                    onDelete={handleDeleteTestCase}
                    onRunSingle={handleRunSingleTestCase}
                    runningTestCaseId={runningTestCaseId}
                    fileUploadCapabilities={fileUploadCapabilities}
                    providerType={currentModelInfo.providerType}
                    modelId={currentModelInfo.modelId}
                    supportsVision={currentModelInfo.supportsVision}
                  />
                )}

                {activeTab === 'criteria' && (
                  <CriteriaEditor
                    criteria={criteria}
                    onAdd={handleAddCriterion}
                    onUpdate={handleUpdateCriterion}
                    onDelete={handleDeleteCriterion}
                  />
                )}

                {activeTab === 'history' && (
                  <RunHistory
                    runs={runs}
                    selectedRunId={selectedRun?.id || null}
                    onSelectRun={handleSelectRun}
                    onStopRun={handleStopRun}
                    onDeleteRun={handleDeleteRun}
                  />
                )}

                {activeTab === 'results' && (
                  results.length > 0 && selectedRun ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-slate-800/30 light:bg-slate-100 border border-slate-700 light:border-slate-200 rounded-lg">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-slate-400 light:text-slate-600">{t('currentViewing')}</span>
                          <Badge variant={statusConfig[selectedRun.status].variant}>
                            {formatDateTime(selectedRun.startedAt)}
                          </Badge>
                          {/* 紧凑的模型参数标签 */}
                          {selectedRun.modelParameters && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 light:text-slate-500">
                              <Settings2 className="w-3 h-3" />
                              <span>T:{selectedRun.modelParameters.temperature}</span>
                              <span>•</span>
                              <span>Max:{selectedRun.modelParameters.max_tokens}</span>
                              {selectedRun.modelParameters.top_p !== undefined && (
                                <>
                                  <span>•</span>
                                  <span>P:{selectedRun.modelParameters.top_p}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {runs.length > 1 && (
                          <button
                            onClick={() => setActiveTab('history')}
                            className="text-xs text-cyan-400 light:text-cyan-600 hover:text-cyan-300 light:hover:text-cyan-700 flex items-center gap-1"
                          >
                            <History className="w-3 h-3" />
                            {t('viewOtherRecords')}
                          </button>
                        )}
                      </div>
                      <EvaluationResultsView
                        testCases={testCases}
                        results={results}
                        criteria={criteria}
                        overallScores={(selectedRun.results as { scores?: Record<string, number> })?.scores || {}}
                        summary={(selectedRun.results as { summary?: string })?.summary}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-12 text-slate-500 light:text-slate-600">
                      <div className="text-center">
                        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-600 light:text-slate-400" />
                        <p>{t('noResultsYet')}</p>
                        <p className="text-xs mt-1">{t('addTestCasesAndRun')}</p>
                      </div>
                    </div>
                  )
                )}
              </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-700 light:text-slate-400" />
              <p className="text-slate-500 light:text-slate-600">{t('selectEvaluationToView')}</p>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showNewEval} onClose={() => setShowNewEval(false)} title={t('newEvaluation')}>
        <div className="space-y-4">
          <Input
            label={t('evaluationName')}
            value={newEvalName}
            onChange={(e) => setNewEvalName(e.target.value)}
            placeholder={t('evaluationNamePlaceholder')}
            autoFocus
          />
          <PromptCascader
            label={t('linkedPromptOptional')}
            value={newEvalPrompt || null}
            onChange={(promptId) => setNewEvalPrompt(promptId || '')}
            prompts={prompts}
            groups={promptGroups}
            allowClear
            clearLabel={t('noLinkedPrompt')}
          />
          <div>
            <label className="block text-sm font-medium text-slate-300 light:text-slate-700 mb-1.5">
              {t('targetModel')}
            </label>
            <ModelSelector
              models={models}
              providers={providers}
              selectedModelId={newEvalModel}
              onSelect={setNewEvalModel}
              placeholder={t('selectModel')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 light:text-slate-700 mb-1.5">
              {t('judgeModel')}
            </label>
            <ModelSelector
              models={models}
              providers={providers}
              selectedModelId={newEvalJudgeModel}
              onSelect={setNewEvalJudgeModel}
              placeholder={t('noJudgeModel')}
            />
          </div>
          <p className="text-xs text-slate-500 light:text-slate-600">
            {tCommon('judgeModelDescription')}
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700 light:border-slate-200">
            <Button variant="ghost" onClick={() => setShowNewEval(false)}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleCreateEvaluation} disabled={!newEvalName.trim()}>
              {tCommon('create')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 模型参数配置 Modal */}
      <Modal isOpen={showParamsModal} onClose={() => setShowParamsModal(false)} title={t('modelParameters')}>
        <div className="space-y-4">
          <ParameterPanel
            config={evalModelConfig}
            onChange={handleModelParametersChange}
            modelId={models.find(m => m.id === selectedEvaluation?.modelId)?.modelId}
            defaultOpen={true}
          />
          <div className="flex justify-end pt-4 border-t border-slate-700 light:border-slate-200">
            <Button onClick={() => setShowParamsModal(false)}>
              {tCommon('confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
