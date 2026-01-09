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
