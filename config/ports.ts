/**
 * Dashboard Port Configuration
 *
 * Re-exports from the ecosystem-wide configuration.
 * Source of truth: /home/sparkone/sdd/ecosystem_config/ports.yaml
 *
 * For ecosystem-wide changes, edit:
 *   /home/sparkone/sdd/ecosystem_config/ports.ts
 *
 * Environment variables can override defaults:
 *   PORT=3101 (dashboard backend)
 *   MEMOS_URL=http://localhost:8001 (memOS base URL)
 */

// Re-export everything from the ecosystem config
export {
  // Port constants
  DASHBOARD_FRONTEND_PORT,
  DASHBOARD_BACKEND_PORT,
  MEMOS_PORT,
  GATEWAY_PORT,
  PDF_TOOLS_PORT,
  DOCLING_PORT,
  SEARXNG_PORT,
  OLLAMA_PORT,
  VLLM_PORT,
  SGLANG_PORT,
  LLAMACPP_PORT,
  TRANSFORMERS_PORT,
  MILVUS_PORT,
  MILVUS_HEALTH_PORT,
  MINIO_PORT,
  MINIO_CONSOLE_PORT,
  ETCD_PORT,
  NEO4J_HTTP_PORT,
  NEO4J_BOLT_PORT,
  POSTGRES_PORT,
  REDIS_PORT,
  GRAFANA_PORT,
  PROMETHEUS_PORT,
  OPEN_WEBUI_PORT,
  MCP_NODE_EDITOR_PORT,
  PDF_GUI_PORT,
  // URL constants
  MEMOS_BASE_URL,
  GATEWAY_BASE_URL,
  PDF_TOOLS_BASE_URL,
  SEARXNG_BASE_URL,
  OLLAMA_BASE_URL,
  VLLM_BASE_URL,
  // Types
  type ServiceConfig,
  type ServiceLink,
  type HealthCheckService,
  // Service arrays
  HEALTH_CHECK_SERVICES,
  SERVICE_LINKS,
  // Helper functions
  getPort,
  getUrl,
  getHealthEndpoint,
} from '../ecosystem_config/ports'

// Legacy alias for backward compatibility
export { MILVUS_HEALTH_PORT as MILVUS_GRPC_PORT } from '../ecosystem_config/ports'
