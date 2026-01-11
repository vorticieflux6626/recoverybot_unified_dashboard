import { useCallback, useMemo } from 'react'
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  Loader2,
  AlertTriangle,
  X,
  Cpu,
  Wrench,
  FileCode,
} from 'lucide-react'
import { useAgentConfigStore } from '@/stores/agentConfigStore'
import { PresetSelector } from './PresetSelector'
import { PipelineStageCard } from './PipelineStageCard'
import { RawYamlEditor } from './RawYamlEditor'
import type { ModelConfig } from '@/lib/api'

// Pipeline stage order for consistent display
const PIPELINE_ORDER = [
  'analyzer',
  'planner',
  'synthesizer',
  'verifier',
  'thinking',
  'url_evaluator',
  'coverage_evaluator',
  'retrieval_evaluator',
  'self_reflection',
]

// Utility task groupings
const UTILITY_GROUPS: Record<string, string[]> = {
  Reasoning: [
    'reasoning_composer',
    'reasoning_dag',
    'enhanced_planner',
    'enhanced_reflector',
  ],
  Retrieval: [
    'cross_encoder',
    'hyde_generator',
    'flare_detector',
    'information_bottleneck',
    'sufficient_context',
    'self_consistency',
    'speculative_verifier',
    'ragas_judge',
  ],
  Analysis: [
    'entity_extractor',
    'query_decomposer',
    'relevance_scorer',
    'uncertainty_detector',
    'entropy_monitor',
    'scraper_analyzer',
  ],
  Knowledge: [
    'experience_distiller',
    'prompt_compressor',
    'raptor_summarizer',
    'graph_extractor',
    'graph_summarizer',
    'cross_domain_validator',
    'entity_grounder',
    'adaptive_refinement',
    'information_gain',
  ],
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t transition-colors ${
        active
          ? 'bg-card text-foreground border-t border-l border-r border-border'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export function AgentConfigPanel() {
  const {
    config,
    rawYaml,
    presets,
    isLoading,
    isSaving,
    isPanelOpen,
    activeTab,
    error,
    pendingChanges,
    lastSaved,
    togglePanel,
    setActiveTab,
    clearError,
    loadRawYaml,
    updateModelField,
    commitPendingChange,
    applyPreset,
    saveToYaml,
    reloadFromYaml,
    saveRawYamlContent,
  } = useAgentConfigStore()

  // Get pipeline configs in order
  const pipelineConfigs = useMemo(() => {
    if (!config?.pipeline) return []
    return PIPELINE_ORDER
      .filter((stage) => stage in config.pipeline)
      .map((stage) => ({
        name: stage,
        config: config.pipeline[stage]!,
      }))
  }, [config?.pipeline])

  // Get utility configs grouped
  const utilityGroups = useMemo(() => {
    if (!config?.utility) return []
    return Object.entries(UTILITY_GROUPS)
      .map(([groupName, tasks]) => ({
        name: groupName,
        tasks: tasks
          .filter((task) => task in config.utility)
          .map((task) => ({
            name: task,
            config: config.utility[task]!,
          })),
      }))
      .filter((group) => group.tasks.length > 0)
  }, [config?.utility])

  const handleUpdateField = useCallback(
    (path: string) => (field: string, value: string | number) => {
      updateModelField(path, field, value)
    },
    [updateModelField]
  )

  const handleCommit = useCallback(
    (path: string) => () => {
      commitPendingChange(path)
    },
    [commitPendingChange]
  )

  // Toggle button for the header
  const toggleButton = (
    <button
      onClick={togglePanel}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
        isPanelOpen
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
      }`}
    >
      <Cpu className="w-4 h-4" />
      Configure Pipeline
      {isPanelOpen ? (
        <ChevronUp className="w-3 h-3" />
      ) : (
        <ChevronDown className="w-3 h-3" />
      )}
    </button>
  )

  if (!isPanelOpen) {
    return toggleButton
  }

  return (
    <div className="flex flex-col">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-2">
        {toggleButton}
        {lastSaved && (
          <span className="text-xs text-muted-foreground">
            Last saved: {new Date(lastSaved).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Main panel */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Error banner */}
        {error && (
          <div className="flex items-center justify-between gap-2 p-3 bg-red-500/10 border-b border-red-500/20 text-red-500 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
            <button
              onClick={clearError}
              className="p-1 hover:bg-red-500/20 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-border bg-muted/30">
          <PresetSelector
            presets={presets.length > 0 ? presets : ['speed', 'quality', 'balanced', 'low_vram']}
            isApplying={isSaving}
            onApply={applyPreset}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={reloadFromYaml}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted rounded hover:bg-muted/80 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Reload
            </button>
            <button
              onClick={saveToYaml}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save to YAML
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-2 border-b border-border bg-muted/20">
          <TabButton
            active={activeTab === 'pipeline'}
            onClick={() => setActiveTab('pipeline')}
            icon={<Cpu className="w-3 h-3" />}
            label="Pipeline"
          />
          <TabButton
            active={activeTab === 'utility'}
            onClick={() => setActiveTab('utility')}
            icon={<Wrench className="w-3 h-3" />}
            label="Utility"
          />
          <TabButton
            active={activeTab === 'raw'}
            onClick={() => {
              setActiveTab('raw')
              if (!rawYaml) loadRawYaml()
            }}
            icon={<FileCode className="w-3 h-3" />}
            label="Raw YAML"
          />
        </div>

        {/* Tab content */}
        <div className="p-4 max-h-[400px] overflow-y-auto">
          {isLoading && !config ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'pipeline' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelineConfigs.map(({ name, config: stageConfig }) => {
                const path = `pipeline.${name}`
                return (
                  <PipelineStageCard
                    key={name}
                    stageName={name}
                    config={stageConfig}
                    isPending={pendingChanges.has(path)}
                    onUpdate={handleUpdateField(path)}
                    onCommit={handleCommit(path)}
                  />
                )
              })}
            </div>
          ) : activeTab === 'utility' ? (
            <div className="space-y-6">
              {utilityGroups.map((group) => (
                <div key={group.name}>
                  <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    {group.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.tasks.map(({ name, config: taskConfig }) => {
                      const path = `utility.${name}`
                      return (
                        <PipelineStageCard
                          key={name}
                          stageName={name}
                          config={taskConfig}
                          isPending={pendingChanges.has(path)}
                          onUpdate={handleUpdateField(path)}
                          onCommit={handleCommit(path)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <RawYamlEditor
              yaml={rawYaml}
              isLoading={isLoading}
              isSaving={isSaving}
              onSave={saveRawYamlContent}
            />
          )}
        </div>
      </div>
    </div>
  )
}
