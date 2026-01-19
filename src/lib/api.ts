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

// ============================================================================
// DocGraph Code Intelligence API
// ============================================================================

export interface DocGraphSearchResult {
  uuid: string
  entity_type: 'function' | 'class' | 'document'
  name: string
  qualified_name?: string
  file_path: string
  project?: string
  line_start?: number
  line_end?: number
  score?: number
}

export interface DocGraphEntityStats {
  functions: number
  classes: number
  documents: number
  files: number
  projects: number
}

export interface DocGraphProjectStats {
  name: string
  functions: number
  classes: number
  documents: number
  files: number
}

export interface DocGraphStats {
  entities: DocGraphEntityStats
  projects: DocGraphProjectStats[]
  lastIndexed?: string
  services: {
    neo4j: 'up' | 'down'
    milvus: 'up' | 'down'
    gateway: 'up' | 'down'
  }
}

export interface DocGraphEntity {
  uuid: string
  name: string
  entity_type: string
  file_path?: string
  qualified_name?: string
  line_start?: number
  line_end?: number
  docstring?: string
  callees: string[]
  callers: string[]
  documents: string[]
  documented_by: string[]
}

export interface DocGraphHealth {
  status: 'healthy' | 'degraded'
  services: {
    neo4j: { status: 'up' | 'down'; latency: number }
    milvus: { status: 'up' | 'down'; latency: number }
    gateway: { status: 'up' | 'down'; latency: number }
  }
  timestamp: string
}

// Fetch DocGraph statistics
export async function fetchDocGraphStats(): Promise<DocGraphStats> {
  const res = await fetch(`${API_BASE}/docgraph/stats`)
  if (!res.ok) throw new Error('Failed to fetch DocGraph stats')
  return res.json()
}

// Search DocGraph
export async function searchDocGraph(params: {
  query: string
  type?: 'keyword' | 'semantic' | 'hybrid'
  limit?: number
  entityTypes?: string[]
}): Promise<{ results: DocGraphSearchResult[]; query: string; type: string; count: number }> {
  const searchParams = new URLSearchParams()
  searchParams.set('q', params.query)
  if (params.type) searchParams.set('type', params.type)
  if (params.limit) searchParams.set('limit', params.limit.toString())
  if (params.entityTypes?.length) searchParams.set('entityTypes', params.entityTypes.join(','))

  const res = await fetch(`${API_BASE}/docgraph/search?${searchParams}`)
  if (!res.ok) throw new Error('Failed to search DocGraph')
  return res.json()
}

// Fetch entity details
export async function fetchDocGraphEntity(uuid: string): Promise<DocGraphEntity> {
  const res = await fetch(`${API_BASE}/docgraph/entity/${encodeURIComponent(uuid)}`)
  if (!res.ok) throw new Error('Entity not found')
  return res.json()
}

// Fetch callers of an entity
export async function fetchDocGraphCallers(uuid: string, depth = 1, limit = 50): Promise<{
  uuid: string
  callers: Array<{
    uuid: string
    name: string
    qualified_name: string
    file_path: string
    line_start: number
    distance: number
  }>
  count: number
}> {
  const res = await fetch(`${API_BASE}/docgraph/callers/${encodeURIComponent(uuid)}?depth=${depth}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch callers')
  return res.json()
}

// Fetch callees of an entity
export async function fetchDocGraphCallees(uuid: string, depth = 1, limit = 50): Promise<{
  uuid: string
  callees: Array<{
    uuid: string
    name: string
    qualified_name: string
    file_path: string
    line_start: number
    distance: number
  }>
  count: number
}> {
  const res = await fetch(`${API_BASE}/docgraph/callees/${encodeURIComponent(uuid)}?depth=${depth}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch callees')
  return res.json()
}

// Fetch all projects
export async function fetchDocGraphProjects(): Promise<{
  projects: Array<{
    name: string
    root_path: string
    description?: string
    repository?: string
  }>
}> {
  const res = await fetch(`${API_BASE}/docgraph/projects`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  return res.json()
}

// Fetch DocGraph health
export async function fetchDocGraphHealth(): Promise<DocGraphHealth> {
  const res = await fetch(`${API_BASE}/docgraph/health`)
  if (!res.ok) throw new Error('Failed to fetch DocGraph health')
  return res.json()
}

// Source code response
export interface SourceCodeResponse {
  path: string
  filename: string
  extension: string
  content: string
  startLine: number
  endLine: number
  totalLines: number
  highlightStart: number
  highlightEnd: number
}

// Graph data types
export interface GraphNode {
  id: string
  name: string
  type: 'function' | 'class' | 'document' | 'file' | 'directory'
  file_path?: string
  qualified_name?: string
  project?: string
  degree?: number
}

export interface GraphEdge {
  source: string
  target: string
  type: 'CALLS' | 'DOCUMENTS' | 'EXTENDS' | 'IMPLEMENTS' | 'CONTAINS' | 'DEFINES'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeCount: number
  edgeCount: number
  centerNode?: string
}

// Fetch graph data centered on an entity
export async function fetchGraphData(uuid: string, depth = 2, limit = 50): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/docgraph/graph/${encodeURIComponent(uuid)}?depth=${depth}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch graph data')
  return res.json()
}

// Fetch sample graph for exploration
export async function fetchSampleGraph(type = 'function', limit = 100, project?: string): Promise<GraphData> {
  const params = new URLSearchParams({ type, limit: String(limit) })
  if (project) params.set('project', project)
  const res = await fetch(`${API_BASE}/docgraph/graph/sample?${params}`)
  if (!res.ok) throw new Error('Failed to fetch sample graph')
  return res.json()
}

// Fetch source code content
export async function fetchSourceCode(params: {
  path: string
  lineStart?: number
  lineEnd?: number
  context?: number
}): Promise<SourceCodeResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('path', params.path)
  if (params.lineStart) searchParams.set('lineStart', params.lineStart.toString())
  if (params.lineEnd) searchParams.set('lineEnd', params.lineEnd.toString())
  if (params.context) searchParams.set('context', params.context.toString())

  const res = await fetch(`${API_BASE}/docgraph/source?${searchParams}`)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch source' }))
    throw new Error(error.error || 'Failed to fetch source')
  }
  return res.json()
}

// ============================================================================
// Enhanced DocGraph Types for Graph Explorer
// ============================================================================

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  entityCount?: number
  children?: FileTreeNode[]
}

export interface FileTreeResponse {
  files: Array<{ path: string; entityCount: number }>
  count: number
  project: string
}

export interface ClassHierarchyMethod {
  uuid: string
  name: string
  signature?: string
  is_async: boolean
  is_static: boolean
  visibility: string
  line_start?: number
}

export interface ClassHierarchy {
  class: {
    uuid: string
    name: string
    qualified_name?: string
    file_path?: string
    line_start?: number
    line_end?: number
    docstring?: string
  }
  parent?: { uuid: string; name: string; qualified_name?: string }
  interfaces: Array<{ uuid: string; name: string; qualified_name?: string }>
  children: Array<{ uuid: string; name: string; qualified_name?: string }>
  methods: ClassHierarchyMethod[]
}

export interface EnhancedDocGraphEntity {
  uuid: string
  name: string
  entity_type: string
  file_path?: string
  qualified_name?: string
  line_start?: number
  line_end?: number
  docstring?: string
  signature?: string
  return_type?: string
  is_async?: boolean
  is_static?: boolean
  is_method?: boolean
  visibility?: 'public' | 'private' | 'protected'
  parent_class?: { uuid: string; name: string; qualified_name?: string }
  arguments?: Array<{
    name: string
    type?: string
    required: boolean
    default_value?: string
    position: number
  }>
  // Enhanced relationship data with UUIDs
  callees: Array<{ uuid: string; name: string; qualified_name?: string }>
  callers: Array<{ uuid: string; name: string; qualified_name?: string }>
  documents: Array<{ uuid: string; title: string; path?: string }>
  documented_by: Array<{ uuid: string; title: string; path?: string }>
}

export interface EnhancedGraphNode extends GraphNode {
  signature?: string
  is_async?: boolean
  visibility?: string
}

// Fetch file tree for a project
export async function fetchFileTree(project?: string): Promise<FileTreeResponse> {
  const params = new URLSearchParams()
  if (project) params.set('project', project)

  const res = await fetch(`${API_BASE}/docgraph/files?${params}`)
  if (!res.ok) throw new Error('Failed to fetch file tree')
  return res.json()
}

// Fetch class hierarchy
export async function fetchClassHierarchy(uuid: string): Promise<ClassHierarchy> {
  const res = await fetch(`${API_BASE}/docgraph/class-hierarchy/${encodeURIComponent(uuid)}`)
  if (!res.ok) throw new Error('Failed to fetch class hierarchy')
  return res.json()
}

// Fetch enhanced entity details (type-safe version for enhanced data)
export async function fetchEnhancedEntity(uuid: string): Promise<EnhancedDocGraphEntity> {
  const res = await fetch(`${API_BASE}/docgraph/entity/${encodeURIComponent(uuid)}`)
  if (!res.ok) throw new Error('Entity not found')
  return res.json()
}
