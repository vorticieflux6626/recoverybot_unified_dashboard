# Unified System Dashboard

> **Created**: 2026-01-03 | **Updated**: 2026-01-25 | **Port**: 3100 | **Version**: 0.4.1

## Quick Reference

| Action | Command | Notes |
|--------|---------|-------|
| **Start Ecosystem** | `./ecosystem.sh start` | Start ALL dependent services |
| **Stop Ecosystem** | `./ecosystem.sh stop` | Stop ALL services |
| **Ecosystem Status** | `./ecosystem.sh status` | Check all service status |
| **Ecosystem Health** | `./ecosystem.sh health` | Deep health check |
| **Start (Dev)** | `npm run start` | Dashboard only (3100 + 3101) |
| **Start Frontend** | `npm run dev` | Vite dev server on port 3100 |
| **Start Backend** | `npm run server` | Express server on port 3101 |
| **Build** | `npm run build` | Production build |
| **Lint** | `npm run lint` | ESLint check |

## Ecosystem Management

This dashboard is the central control point for the RecoveryBot ecosystem. The `ecosystem.sh` script orchestrates all dependent services.

### Start Everything

```bash
./ecosystem.sh start     # Start all services in dependency order
./ecosystem.sh status    # Verify everything is running
```

### CLI Documentation

See `ECOSYSTEM_CLI_GUIDE.txt` for comprehensive command-line documentation.

### Management Scripts

| Script | Purpose |
|--------|---------|
| `./ecosystem.sh` | Master orchestration (start/stop/status/health/logs) |
| `./start.sh` | Start dashboard only (development) |
| `./start-prod.sh` | Start dashboard only (production) |
| `./scripts/ollama.sh` | Ollama LLM management |
| `./scripts/docker-services.sh` | Docker container management |
| `./scripts/gaming-mode.sh` | Gaming mode detection utility |

### Gaming Mode

The ecosystem supports automatic deferral of CPU/GPU intensive background tasks when gaming is detected.

**Detection Methods**:
- Steam client + game processes
- Proton/Wine processes
- High GPU utilization (>80%)
- Systemd gaming inhibitors

**Ecosystem Commands**:

```bash
./ecosystem.sh gaming       # Check gaming mode status
./ecosystem.sh pause-heavy  # Pause CPU/GPU intensive services
./ecosystem.sh resume-heavy # Resume heavy services after gaming
```

**Affected Background Tasks**:
- DocGraph full indexing (weekly Sunday 3 AM) - **Deferred if gaming**
- MCP ecosystem re-indexing (nightly) - **Deferred if gaming**
- DocGraph incremental sync (every 6h) - Runs normally (lightweight)

**Environment Variables**:
- `GAMING_MODE_SKIP=1` - Force background tasks to run regardless
- `GAMING_MODE_GPU_THRESHOLD=80` - GPU % threshold (default: 80)

### Dependent Services

| Service | Location | Port | Management Script |
|---------|----------|------|-------------------|
| memOS | `Recovery_Bot/memOS/server/` | 8001 | `./start_server.sh` |
| Gateway | `Recovery_Bot/gateway/` | 8100 | `./scripts/start.sh` |
| PDF Tools | `PDF_Extraction_Tools/` | 8002 | `./api_server.sh` |
| Ollama | System service | 11434 | `scripts/ollama.sh` |
| Docker containers | Docker | - | `scripts/docker-services.sh` |

## Architecture

This dashboard consolidates 14-15 GUI services from the Recovery Bot ecosystem into a single unified interface.

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript | UI framework |
| **Styling** | Tailwind CSS + shadcn/ui | Component library |
| **Charts** | ECharts | GPU metrics visualization |
| **Terminal** | xterm.js | Log viewer |
| **State** | Zustand | Global state management |
| **Data** | TanStack Query | API caching/fetching |
| **Backend** | Express.js | API aggregation |

### Port Allocation

| Port | Service | Purpose |
|------|---------|---------|
| 3100 | Frontend (Vite) | Dashboard UI |
| 3101 | Backend (Express) | API aggregation |

### Central Port Configuration

**Location**: `config/ports.ts`

All service ports are centralized in a single TypeScript config file. Import from this file instead of hardcoding ports:

```typescript
// In server code
import { MEMOS_BASE_URL, DASHBOARD_BACKEND_PORT } from '../config/ports'

// In frontend code (via @config alias)
import { DASHBOARD_FRONTEND_PORT, SERVICE_LINKS } from '@config/ports'
```

**Available exports**:
- Port constants: `DASHBOARD_FRONTEND_PORT`, `DASHBOARD_BACKEND_PORT`, `MEMOS_PORT`, `GATEWAY_PORT`, etc.
- Base URLs: `MEMOS_BASE_URL`, `GATEWAY_BASE_URL`, `OLLAMA_BASE_URL`, etc.
- Service configs: `HEALTH_CHECK_SERVICES`, `SERVICE_LINKS`

**Environment overrides**:
- `PORT` - Override dashboard backend port (default: 3101)
- `MEMOS_URL` - Override memOS base URL (default: http://localhost:8001)
- `GATEWAY_URL` - Override Gateway base URL (default: http://localhost:8100)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health/aggregate` | GET | All service health statuses |
| `/api/health/:service` | GET | Single service health |
| `/api/gpu/status` | GET | GPU metrics (proxied from memOS) |
| `/api/processes` | GET | Running processes list |
| `/api/logs` | GET | Historical log entries |
| `/api/logs/stream` | SSE | Real-time log stream |
| `/api/docs/tree` | GET | Documentation file tree |
| `/api/docs/content` | GET | Documentation file content |
| `/api/agent/config/llm-models` | GET | Get LLM model config (proxied) |
| `/api/agent/config/llm-models` | PUT | Update model assignment |
| `/api/agent/config/llm-models/reload` | POST | Reload config from YAML |
| `/api/agent/config/llm-models/save` | POST | Save config to YAML |
| `/api/agent/config/llm-models/presets` | GET | List available presets |
| `/api/agent/config/llm-models/presets/:name` | POST | Apply a preset |
| `/api/agent/config/llm-models/raw` | GET | Get raw YAML content |
| `/api/agent/config/llm-models/raw` | PUT | Save raw YAML content |
| `/api/docgraph/stats` | GET | DocGraph index statistics |
| `/api/docgraph/search` | GET | Search code entities |
| `/api/docgraph/entity/:uuid` | GET | Get entity details |
| `/api/docgraph/callers/:uuid` | GET | Get functions calling entity |
| `/api/docgraph/callees/:uuid` | GET | Get functions called by entity |
| `/api/docgraph/projects` | GET | List indexed projects |
| `/api/docgraph/health` | GET | DocGraph service health |
| `/api/docgraph/source` | GET | Fetch source code with line context |
| `/api/docgraph/files` | GET | File tree with entity counts |
| `/api/docgraph/class-hierarchy/:uuid` | GET | Class inheritance hierarchy |
| `/api/docgraph/graph/sample` | GET | Graph exploration sample |
| `/api/docgraph/graph/:uuid` | GET | Entity-centered graph data |
| `/api/agent/search` | POST | Proxy agentic search to memOS |
| `/api/agent/stream/global` | SSE | Global observability event stream |
| `/api/agent/events/:requestId` | SSE | Request-specific event stream |
| `/api/agent/history` | GET | Recent search history |
| `/api/agent/memos/stats` | GET | memOS statistics |
| `/api/agent/observability/:requestId` | GET | Request observability summary |
| `/api/agent/observability/:requestId/decisions` | GET | Agent decision timeline |
| `/api/agent/observability/:requestId/context-flow` | GET | Token flow Sankey data |
| `/api/agent/observability/:requestId/llm-calls` | GET | LLM call metrics |
| `/api/agent/observability/:requestId/scratchpad` | GET | Scratchpad state evolution |
| `/api/agent/observability/:requestId/confidence` | GET | Confidence breakdown |

### LLM Model Configuration API (memOS)

The dashboard can access memOS LLM model configurations for pipeline tuning:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/config/llm-models` | GET | Get current LLM model config |
| `/api/v1/config/llm-models` | PUT | Update a model assignment |
| `/api/v1/config/llm-models/reload` | POST | Reload config from YAML |
| `/api/v1/config/llm-models/save` | POST | Save config to YAML |
| `/api/v1/config/llm-models/presets` | GET | List available presets |
| `/api/v1/config/llm-models/presets/{name}` | POST | Apply a preset |
| `/api/v1/config/llm-models/raw` | GET | Get raw YAML content |

**Config File Location**: `/home/sparkone/sdd/Recovery_Bot/memOS/server/config/llm_models.yaml`

**Presets Available**:
- `speed` - Fastest models (ministral-3:3b, gemma3:4b)
- `quality` - Best models (qwen3:14b, deepseek-r1:14b)
- `balanced` - Production default (qwen3:8b + ministral-3:3b)
- `low_vram` - Minimal VRAM (all gemma3:4b)

## Services Monitored

The dashboard monitors these ecosystem services:

| Service | Port | Health Endpoint |
|---------|------|-----------------|
| memOS | 8001 | `/api/v1/system/health/aggregate` |
| Gateway | 8100 | `/health` |
| SearXNG | 8888 | `/healthz` |
| PDF Tools | 8002 | `/health` |
| Ollama | 11434 | `/api/version` |
| Milvus | 9091 | `/healthz` |
| PostgreSQL | 5432 | `pg_isready` |
| Redis | 6379 | `redis-cli ping` |

## Project Structure

```
unified_dashboard/
├── src/
│   ├── components/
│   │   ├── layout/      # Sidebar, Header
│   │   ├── health/      # Service health cards
│   │   ├── gpu/         # GPU monitoring
│   │   ├── logs/        # Log viewer
│   │   ├── docs/        # Documentation browser
│   │   ├── processes/   # Process list
│   │   ├── agent/       # Agent console & config
│   │   │   ├── AgentConsole.tsx
│   │   │   └── config/  # LLM config panel
│   │   │       ├── AgentConfigPanel.tsx
│   │   │       ├── PresetSelector.tsx
│   │   │       ├── PipelineStageCard.tsx
│   │   │       └── RawYamlEditor.tsx
│   │   ├── docgraph/    # Code Intelligence
│   │   │   ├── SearchPanel.tsx   # Search interface
│   │   │   ├── StatsPanel.tsx    # Statistics dashboard
│   │   │   └── index.ts          # Barrel export
│   │   └── tabs/        # Main tab views
│   │       ├── OverviewTab.tsx
│   │       ├── LogsTab.tsx
│   │       ├── DocsTab.tsx
│   │       ├── CodeIntelligenceTab.tsx
│   │       └── SettingsTab.tsx
│   ├── hooks/           # Custom React hooks
│   ├── stores/          # Zustand stores
│   │   ├── dashboardStore.ts
│   │   └── agentConfigStore.ts
│   └── lib/             # Utilities, API client
├── server/
│   ├── routes/          # Express routes
│   │   ├── health.ts    # Health aggregation
│   │   ├── gpu.ts       # GPU status proxy
│   │   ├── logs.ts      # Log collection
│   │   ├── docs.ts      # Documentation server
│   │   ├── processes.ts # Process monitoring
│   │   ├── agent.ts     # Agent API + config proxy
│   │   └── docgraph.ts  # DocGraph search API
│   └── index.ts         # Express entry point
└── public/              # Static assets
```

## Integration with Ecosystem

### Dependencies
- **memOS**: GPU status endpoint, health aggregate
- **All services**: Health check endpoints
- **Docker**: Container stats for SearXNG, Milvus, etc.
- **journalctl**: Ollama logs
- **nvidia-smi**: Fallback GPU metrics

### nginx Integration (Optional)

Add to `technobot.sparkonelabs.com:8443` config:
```nginx
location /dashboard/ {
    proxy_pass http://127.0.0.1:3100/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## MCP Code Intelligence

This project is indexed by the ecosystem-wide MCP code intelligence layer.

**Infrastructure**: `/home/sparkone/sdd/mcp_infrastructure/`

### Search Commands

```bash
# Activate venv first (required)
source /home/sparkone/sdd/mcp_infrastructure/venv/bin/activate

# Search this project
kit search /home/sparkone/sdd/unified_dashboard "ecosystem"

# Search all ecosystem projects
kit search /home/sparkone/sdd/Recovery_Bot/memOS "VRAM"
kit search /home/sparkone/sdd/PDF_Extraction_Tools "graph"
```

### Management Commands

| Tool | Command | Purpose |
|------|---------|---------|
| **Search code** | `kit search /path "query"` | Find code patterns |
| **File tree** | `kit file-tree /path` | View structure |
| **Re-index all** | `/home/sparkone/sdd/mcp_infrastructure/scripts/index_ecosystem.sh` | Refresh all 8 projects |
| **Index single** | `/home/sparkone/sdd/mcp_infrastructure/scripts/index_project.sh /path` | Refresh one project |

### Embeddings via Gateway

The code intelligence layer routes embeddings through Gateway for VRAM management:

```bash
curl -X POST http://localhost:8100/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":"your query"}'
```

## Code Intelligence Tab

The Code Intelligence tab provides semantic code search and exploration powered by the DocGraph system.

### Features

- **Search**: Full-text and semantic search across functions, classes, and documents
- **Browse**: File tree browser for documentation
- **Stats**: Real-time indexing statistics showing entity counts and service health
- **Graph Explorer**: Interactive code relationship visualization with:
  - **Entity Type Views**: Functions, Classes, or Documents
  - **Project Filtering**: Filter by indexed project
  - **Directory Hierarchy**: Visual representation of project structure (directories → files → classes → methods)
  - **Relationship Types**: CALLS, DOCUMENTS, EXTENDS, IMPLEMENTS, CONTAINS, DEFINES
  - **Layout Modes**: Force-directed (exploration) or Hierarchical (tree view)
  - **Level-of-Detail**: Automatic detail adjustment based on zoom level
  - **Node Details Panel**: Full entity information with callers/callees, arguments, signatures

### Graph Explorer Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Deselect node |
| `Ctrl/Cmd + F` | Focus search |
| `+` / `-` | Zoom in/out |
| `0` | Fit to view |
| `H` | Toggle hierarchy layout |
| `?` | Toggle keyboard help |

### Graph Node Types

| Type | Color | Description |
|------|-------|-------------|
| Function | Blue | Functions and methods |
| Class | Green | Class definitions |
| Document | Orange | Documentation files |
| File | Yellow | Source code files |
| Directory | Purple | Project directories |

### Graph Edge Types

| Type | Style | Description |
|------|-------|-------------|
| CALLS | Solid indigo | Function call relationships |
| DOCUMENTS | Solid purple | Documentation links |
| EXTENDS | Solid green | Class inheritance |
| IMPLEMENTS | Dashed blue | Interface implementation |
| CONTAINS | Dotted orange | File/directory containment |
| DEFINES | Dotted yellow | Class method definitions |

### Indexed Data (via DocGraph)
- ~400K functions with call graph relationships
- ~74K classes with inheritance hierarchies (EXTENDS, IMPLEMENTS)
- ~2.1M CALLS relationships
- Documents linked to code entities
- Full-text search via Neo4j
- Vector similarity search via Milvus (coming soon)

### Service Dependencies
| Service | Port | Purpose |
|---------|------|---------|
| Neo4j | 7687 | Graph database for code relationships |
| Milvus | 19530 | Vector store for semantic search |
| Gateway | 8100 | Embedding generation |

---

## Agent Configuration Panel

The Agent Console tab includes a live configuration panel for managing memOS LLM model assignments.

### Features

- **Preset Switching**: Apply speed/quality/balanced/low_vram presets with one click
- **Pipeline Configuration**: Configure 9 pipeline stages in execution order:
  - `analyzer` - Query analysis and classification
  - `url_evaluator` - LLM-based URL relevance filtering before scraping
  - `coverage_evaluator` - Content coverage assessment
  - `planner` - Multi-phase search planning
  - `synthesizer` - Final response synthesis
  - `thinking` - Extended reasoning for complex queries
  - `retrieval_evaluator` - CRAG document relevance scoring
  - `self_reflection` - Post-synthesis quality check
  - `verifier` - Fact checking against sources
- **Utility Models**: Configure 28 utility models grouped by category:
  - **Reasoning** (4): reasoning_composer, reasoning_dag, enhanced_planner, enhanced_reflector
  - **Retrieval** (8): cross_encoder, hyde_generator, flare_detector, information_bottleneck, sufficient_context, self_consistency, speculative_verifier, ragas_judge
  - **Analysis** (6): entity_extractor, query_decomposer, relevance_scorer, uncertainty_detector, entropy_monitor, scraper_analyzer
  - **Knowledge** (9): experience_distiller, prompt_compressor, raptor_summarizer, graph_extractor, graph_summarizer, cross_domain_validator, entity_grounder, adaptive_refinement, information_gain
  - **Dynamic** (1): actor_factory (AIME-style dynamic agent assembly)
- **Raw YAML Editor**: Direct editing of `llm_models.yaml` with syntax validation
- **Live Updates**: Changes save immediately with optimistic UI updates

### Usage

1. Open the dashboard at http://localhost:3100
2. Navigate to the **Agent Console** tab
3. Click **"Configure Pipeline"** to expand the configuration panel
4. Use tabs to switch between Pipeline, Utility, and Raw YAML views
5. Changes are saved immediately; use "Save to YAML" to persist to disk

### State Management

The configuration panel uses a dedicated Zustand store (`agentConfigStore.ts`) with:
- Optimistic updates for responsive UI
- Debounced saves to prevent excessive API calls
- Pending change tracking with visual indicators
- Error recovery with rollback support

---

*Last Updated: 2026-01-26 | Added gaming mode detection for CPU/GPU resource management*
