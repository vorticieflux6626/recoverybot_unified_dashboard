// API client for backend aggregation service

const API_BASE = '/api'

export interface ServiceHealth {
  name: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  port: number
  latency?: number
  message?: string
  lastCheck: string
}

export interface GPUStatus {
  name: string
  vramUsed: number
  vramTotal: number
  utilization: number
  temperature: number
  powerDraw: number
  loadedModels: string[]
}

export interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  memory: number
  uptime: string
  type: 'native' | 'docker'
}

export interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  message: string
}

// Health endpoints
export async function fetchHealthAggregate(): Promise<ServiceHealth[]> {
  const res = await fetch(`${API_BASE}/health/aggregate`)
  if (!res.ok) throw new Error('Failed to fetch health')
  return res.json()
}

// GPU endpoints
export async function fetchGPUStatus(): Promise<GPUStatus> {
  const res = await fetch(`${API_BASE}/gpu/status`)
  if (!res.ok) throw new Error('Failed to fetch GPU status')
  return res.json()
}

// Process endpoints
export async function fetchProcesses(): Promise<ProcessInfo[]> {
  const res = await fetch(`${API_BASE}/processes`)
  if (!res.ok) throw new Error('Failed to fetch processes')
  return res.json()
}

// Log endpoints
export async function fetchLogs(params?: {
  source?: string
  level?: string
  limit?: number
}): Promise<LogEntry[]> {
  const searchParams = new URLSearchParams()
  if (params?.source) searchParams.set('source', params.source)
  if (params?.level) searchParams.set('level', params.level)
  if (params?.limit) searchParams.set('limit', params.limit.toString())

  const res = await fetch(`${API_BASE}/logs?${searchParams}`)
  if (!res.ok) throw new Error('Failed to fetch logs')
  return res.json()
}

// Documentation endpoints
export interface DocFile {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DocFile[]
}

export async function fetchDocTree(): Promise<DocFile[]> {
  const res = await fetch(`${API_BASE}/docs/tree`)
  if (!res.ok) throw new Error('Failed to fetch doc tree')
  return res.json()
}

export async function fetchDocContent(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/docs/content?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error('Failed to fetch doc content')
  return res.text()
}

// SSE connections
export function createSSEConnection(
  path: string,
  onMessage: (event: MessageEvent) => void,
  onError?: (event: Event) => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE}${path}`)
  eventSource.onmessage = onMessage
  if (onError) eventSource.onerror = onError
  return eventSource
}

// ============================================================================
// LLM Model Configuration Types & API
// ============================================================================

export interface ModelConfig {
  model: string
  context_window: number
  temperature: number
  max_tokens: number
  description: string
  notes?: string
}

export interface EmbeddingConfig {
  model: string
  dimensions: number
  description?: string
}

export interface LLMConfig {
  version: string
  last_updated: string
  pipeline: Record<string, ModelConfig>
  utility: Record<string, ModelConfig>
  embeddings: Record<string, EmbeddingConfig>
  corpus: Record<string, ModelConfig>
  presets: Record<string, Record<string, string>>
}

export interface PresetInfo {
  name: string
  description?: string
  models: Record<string, string>
}

// Fetch full LLM configuration
export async function fetchLLMConfig(): Promise<LLMConfig> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models`)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch LLM config' }))
    throw new Error(error.error || 'Failed to fetch LLM config')
  }
  const json = await res.json()
  // memOS wraps response in {success, data}
  return json.data || json
}

// Update a single model assignment
export async function updateLLMModel(
  path: string,
  changes: Partial<ModelConfig>
): Promise<{ old_value: string; new_value: string }> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, ...changes }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to update model' }))
    throw new Error(error.error || 'Failed to update model')
  }
  return res.json()
}

// Reload config from YAML file (discards in-memory changes)
export async function reloadLLMConfig(): Promise<{ version: string; last_updated: string }> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models/reload`, {
    method: 'POST',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to reload config' }))
    throw new Error(error.error || 'Failed to reload config')
  }
  return res.json()
}

// Save current config to YAML file
export async function saveLLMConfig(): Promise<{ config_path: string }> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models/save`, {
    method: 'POST',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to save config' }))
    throw new Error(error.error || 'Failed to save config')
  }
  return res.json()
}

// Fetch available presets
export async function fetchLLMPresets(): Promise<{ presets: string[]; details: Record<string, PresetInfo> }> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models/presets`)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch presets' }))
    throw new Error(error.error || 'Failed to fetch presets')
  }
  const json = await res.json()
  // memOS returns {success, data: {presets: [...], details: {...}}}
  const data = json.data || json
  // Handle case where presets is just an array of strings
  if (Array.isArray(data.presets)) {
    return { presets: data.presets, details: data.details || {} }
  }
  if (Array.isArray(data)) {
    return { presets: data, details: {} }
  }
  return { presets: [], details: {} }
}

// Apply a preset
export async function applyLLMPreset(presetName: string): Promise<{ preset: string; changes: Record<string, string> }> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models/presets/${encodeURIComponent(presetName)}`, {
    method: 'POST',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to apply preset' }))
    throw new Error(error.error || 'Failed to apply preset')
  }
  return res.json()
}

// Fetch raw YAML content
export async function fetchRawYaml(): Promise<string> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models/raw`)
  if (!res.ok) {
    throw new Error('Failed to fetch raw YAML')
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    // memOS wraps in {success, data: {content: "..."}}
    const json = await res.json()
    return json.data?.content || json.content || ''
  }
  return res.text()
}

// Save raw YAML content
export async function saveRawYaml(yaml: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/agent/config/llm-models/raw`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yaml }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to save YAML' }))
    throw new Error(error.error || 'Failed to save YAML')
  }
  return res.json()
}
