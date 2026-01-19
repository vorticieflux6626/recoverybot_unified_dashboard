/**
 * Dashboard Port Configuration
 *
 * Local port constants for the dashboard.
 * For ecosystem-wide config, see: /home/sparkone/sdd/ecosystem_config/
 */

// Environment helper
const getEnv = (key: string, defaultValue: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!
  }
  return defaultValue
}

// Dashboard
export const DASHBOARD_FRONTEND_PORT = 3100
export const DASHBOARD_BACKEND_PORT = parseInt(getEnv('PORT', '3101'), 10)

// Core Services
export const MEMOS_PORT = 8001
export const GATEWAY_PORT = 8100
export const PDF_TOOLS_PORT = 8002
export const DOCLING_PORT = 8003

// Search
export const SEARXNG_PORT = 8888

// LLM Backends
export const OLLAMA_PORT = 11434
export const VLLM_PORT = 8000
export const SGLANG_PORT = 30000
export const LLAMACPP_PORT = 8084
export const TRANSFORMERS_PORT = 8085

// Vector DB & Storage
export const MILVUS_PORT = 19530
export const MILVUS_HEALTH_PORT = 9091
export const MINIO_PORT = 9000
export const MINIO_CONSOLE_PORT = 9001
export const ETCD_PORT = 2379

// Graph Database (DocGraph)
export const NEO4J_HTTP_PORT = 7474
export const NEO4J_BOLT_PORT = 7687

// Databases
export const POSTGRES_PORT = 5432
export const REDIS_PORT = 6379

// Monitoring & Tools
export const GRAFANA_PORT = 3000
export const PROMETHEUS_PORT = 9090
export const OPEN_WEBUI_PORT = 8080
export const MCP_NODE_EDITOR_PORT = 7777
export const PDF_GUI_PORT = 7878

// URL Constants
export const MEMOS_BASE_URL = getEnv('MEMOS_URL', `http://localhost:${MEMOS_PORT}`)
export const GATEWAY_BASE_URL = getEnv('GATEWAY_URL', `http://localhost:${GATEWAY_PORT}`)
export const PDF_TOOLS_BASE_URL = getEnv('PDF_TOOLS_URL', `http://localhost:${PDF_TOOLS_PORT}`)
export const SEARXNG_BASE_URL = getEnv('SEARXNG_URL', `http://localhost:${SEARXNG_PORT}`)
export const OLLAMA_BASE_URL = getEnv('OLLAMA_URL', `http://localhost:${OLLAMA_PORT}`)
export const VLLM_BASE_URL = getEnv('VLLM_URL', `http://localhost:${VLLM_PORT}`)

// Types
export interface ServiceConfig {
  port: number
  description: string
  healthEndpoint?: string
  type?: 'http' | 'tcp'
}

export interface ServiceLink {
  name: string
  url: string
  port: number
  description: string
}

export interface HealthCheckService {
  name: string
  port: number
  healthEndpoint: string
  type: 'http' | 'tcp'
}

// Health Check Services
export const HEALTH_CHECK_SERVICES: HealthCheckService[] = [
  { name: 'memOS', port: MEMOS_PORT, healthEndpoint: '/api/v1/system/health/aggregate', type: 'http' },
  { name: 'Gateway', port: GATEWAY_PORT, healthEndpoint: '/health', type: 'http' },
  { name: 'SearXNG', port: SEARXNG_PORT, healthEndpoint: '/healthz', type: 'http' },
  { name: 'PDF Tools', port: PDF_TOOLS_PORT, healthEndpoint: '/health', type: 'http' },
  { name: 'Ollama', port: OLLAMA_PORT, healthEndpoint: '/api/version', type: 'http' },
  { name: 'Neo4j', port: NEO4J_HTTP_PORT, healthEndpoint: '/', type: 'http' },
  { name: 'Milvus', port: MILVUS_HEALTH_PORT, healthEndpoint: '/healthz', type: 'http' },
  { name: 'MinIO', port: MINIO_PORT, healthEndpoint: '/minio/health/live', type: 'http' },
  { name: 'etcd', port: ETCD_PORT, healthEndpoint: '/health', type: 'http' },
  { name: 'PostgreSQL', port: POSTGRES_PORT, healthEndpoint: '', type: 'tcp' },
  { name: 'Redis', port: REDIS_PORT, healthEndpoint: '', type: 'tcp' },
]

// Service Links
export const SERVICE_LINKS: ServiceLink[] = [
  { name: 'memOS API', url: `http://localhost:${MEMOS_PORT}/docs`, port: MEMOS_PORT, description: 'FastAPI documentation' },
  { name: 'LLM Gateway', url: `http://localhost:${GATEWAY_PORT}/docs`, port: GATEWAY_PORT, description: 'LLM routing' },
  { name: 'PDF Tools API', url: `http://localhost:${PDF_TOOLS_PORT}/docs`, port: PDF_TOOLS_PORT, description: 'PDF extraction' },
  { name: 'SearXNG', url: `http://localhost:${SEARXNG_PORT}`, port: SEARXNG_PORT, description: 'Metasearch' },
  { name: 'Neo4j Browser', url: `http://localhost:${NEO4J_HTTP_PORT}`, port: NEO4J_HTTP_PORT, description: 'Graph DB' },
]

// Helper functions
export function getPort(service: string): number {
  const portMap: Record<string, number> = {
    memos: MEMOS_PORT,
    gateway: GATEWAY_PORT,
    pdf_tools: PDF_TOOLS_PORT,
    searxng: SEARXNG_PORT,
    ollama: OLLAMA_PORT,
    neo4j: NEO4J_HTTP_PORT,
    milvus: MILVUS_PORT,
  }
  return portMap[service] ?? 0
}

export function getUrl(service: string, host = 'localhost'): string {
  return `http://${host}:${getPort(service)}`
}

export function getHealthEndpoint(service: string): string {
  const svc = HEALTH_CHECK_SERVICES.find(s => s.name.toLowerCase() === service.toLowerCase())
  return svc?.healthEndpoint ?? '/'
}

// Legacy alias
export const MILVUS_GRPC_PORT = MILVUS_HEALTH_PORT
