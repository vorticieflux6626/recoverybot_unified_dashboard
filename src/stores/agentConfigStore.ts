import { create } from 'zustand'
import type { LLMConfig, ModelConfig, PresetInfo } from '@/lib/api'
import {
  fetchLLMConfig,
  fetchLLMPresets,
  fetchRawYaml,
  updateLLMModel,
  applyLLMPreset,
  saveLLMConfig,
  reloadLLMConfig,
  saveRawYaml,
} from '@/lib/api'

type ConfigTab = 'pipeline' | 'utility' | 'raw'

interface PendingChange {
  path: string
  field: string
  value: string | number
  timestamp: number
}

interface AgentConfigState {
  // Config data
  config: LLMConfig | null
  rawYaml: string
  presets: string[]
  presetDetails: Record<string, PresetInfo>

  // UI state
  isLoading: boolean
  isSaving: boolean
  isPanelOpen: boolean
  activeTab: ConfigTab
  error: string | null
  pendingChanges: Map<string, PendingChange>
  lastSaved: string | null

  // Actions - UI
  togglePanel: () => void
  setActiveTab: (tab: ConfigTab) => void
  setError: (error: string | null) => void
  clearError: () => void

  // Actions - Data fetching
  loadConfig: () => Promise<void>
  loadPresets: () => Promise<void>
  loadRawYaml: () => Promise<void>

  // Actions - Updates
  updateModelField: (path: string, field: string, value: string | number) => void
  commitPendingChange: (path: string) => Promise<void>
  applyPreset: (presetName: string) => Promise<void>

  // Actions - Persistence
  saveToYaml: () => Promise<void>
  reloadFromYaml: () => Promise<void>
  saveRawYamlContent: (content: string) => Promise<void>
}

export const useAgentConfigStore = create<AgentConfigState>((set, get) => ({
  // Initial state
  config: null,
  rawYaml: '',
  presets: [],
  presetDetails: {},
  isLoading: false,
  isSaving: false,
  isPanelOpen: false,
  activeTab: 'pipeline',
  error: null,
  pendingChanges: new Map(),
  lastSaved: null,

  // UI Actions
  togglePanel: () => {
    const isOpening = !get().isPanelOpen
    set({ isPanelOpen: isOpening })
    // Load config when opening panel
    if (isOpening && !get().config) {
      get().loadConfig()
      get().loadPresets()
    }
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab })
    // Load raw YAML when switching to raw tab
    if (tab === 'raw' && !get().rawYaml) {
      get().loadRawYaml()
    }
  },

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // Data fetching
  loadConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      const config = await fetchLLMConfig()
      set({ config, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load config'
      set({ error: message, isLoading: false })
    }
  },

  loadPresets: async () => {
    try {
      const data = await fetchLLMPresets()
      set({
        presets: data.presets || [],
        presetDetails: data.details || {},
      })
    } catch (err) {
      // Non-critical, don't show error
      console.warn('Failed to load presets:', err)
    }
  },

  loadRawYaml: async () => {
    set({ isLoading: true })
    try {
      const yaml = await fetchRawYaml()
      set({ rawYaml: yaml, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load YAML'
      set({ error: message, isLoading: false })
    }
  },

  // Update a model field optimistically
  updateModelField: (path, field, value) => {
    const { config, pendingChanges } = get()
    if (!config) return

    // Parse path like "pipeline.synthesizer" or "utility.cross_encoder"
    const [category, taskName] = path.split('.')
    if (!category || !taskName) return

    // Optimistic update
    const newConfig = { ...config }
    const categoryConfig = newConfig[category as keyof LLMConfig]
    if (typeof categoryConfig === 'object' && categoryConfig !== null && taskName in categoryConfig) {
      const taskConfig = (categoryConfig as Record<string, ModelConfig>)[taskName]
      if (taskConfig) {
        ;(categoryConfig as Record<string, ModelConfig>)[taskName] = {
          ...taskConfig,
          [field]: value,
        } as ModelConfig
      }
    }

    // Track pending change
    const newPendingChanges = new Map(pendingChanges)
    newPendingChanges.set(path, {
      path,
      field,
      value,
      timestamp: Date.now(),
    })

    set({ config: newConfig, pendingChanges: newPendingChanges })
  },

  // Commit a pending change to the server
  commitPendingChange: async (path) => {
    const { pendingChanges } = get()
    const change = pendingChanges.get(path)
    if (!change) return

    set({ isSaving: true })
    try {
      await updateLLMModel(path, { [change.field]: change.value } as Partial<ModelConfig>)

      // Remove from pending
      const newPendingChanges = new Map(pendingChanges)
      newPendingChanges.delete(path)
      set({
        pendingChanges: newPendingChanges,
        isSaving: false,
        lastSaved: new Date().toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save change'
      set({ error: message, isSaving: false })
    }
  },

  // Apply a preset
  applyPreset: async (presetName) => {
    set({ isSaving: true, error: null })
    try {
      await applyLLMPreset(presetName)
      // Reload config to get updated values
      await get().loadConfig()
      set({ isSaving: false, lastSaved: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply preset'
      set({ error: message, isSaving: false })
    }
  },

  // Save current config to YAML file
  saveToYaml: async () => {
    set({ isSaving: true, error: null })
    try {
      await saveLLMConfig()
      set({ isSaving: false, lastSaved: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save config'
      set({ error: message, isSaving: false })
    }
  },

  // Reload config from YAML file
  reloadFromYaml: async () => {
    set({ isLoading: true, error: null, pendingChanges: new Map() })
    try {
      await reloadLLMConfig()
      await get().loadConfig()
      if (get().activeTab === 'raw') {
        await get().loadRawYaml()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reload config'
      set({ error: message, isLoading: false })
    }
  },

  // Save raw YAML content
  saveRawYamlContent: async (content) => {
    set({ isSaving: true, error: null })
    try {
      await saveRawYaml(content)
      set({
        rawYaml: content,
        isSaving: false,
        lastSaved: new Date().toISOString(),
      })
      // Reload structured config
      await get().loadConfig()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save YAML'
      set({ error: message, isSaving: false })
    }
  },
}))
