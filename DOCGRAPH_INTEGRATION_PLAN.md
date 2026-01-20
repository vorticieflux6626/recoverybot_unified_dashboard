# DocGraph Integration Plan for Unified Dashboard

> **Created**: 2026-01-18 | **Status**: Complete | **Priority**: High | **Last Updated**: 2026-01-19

## Executive Summary

This plan outlines the integration of the DocGraph code intelligence system into the unified dashboard's Documentation tab, transforming it from a simple file browser into a powerful code and documentation search interface with indexing statistics and graph visualization.

---

## Current State Analysis

### DocsTab Limitations (Current)
- **No search functionality** - users must browse tree manually
- **No indexing stats** - no visibility into code intelligence system
- **Read-only file browser** - limited to 4 hardcoded project roots
- **Max depth 3** - misses docs in deeper directories
- **No semantic search** - exact path-based access only

### Available DocGraph APIs
| API | Endpoint/Tool | Capability |
|-----|---------------|------------|
| **MCP Server** | 12 tools via stdio | hybrid_search, semantic_search, find_callers, explain_code |
| **Neo4j** | bolt://localhost:7687 | Graph queries, full-text search, code structure |
| **Milvus** | localhost:19530 | Vector similarity search, 1024-dim embeddings |
| **Gateway** | http://localhost:8100/api/embed | Generate embeddings for queries |

### Indexed Data
- **400,102** functions
- **74,475** classes
- **74,196** files
- **25,009** documents
- **6** projects

---

## Proposed Architecture

### New Tab Structure: "Code Intelligence"

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Search: [___________________________________] [⚙️ Filters]  │
│     [Semantic ◉] [Keyword ○] [Regex ○]    Scope: [All ▾]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┬─────────┬─────────┬─────────┐                     │
│  │ Search  │ Browse  │ Graph   │ Stats   │  ← Sub-tabs         │
│  └─────────┴─────────┴─────────┴─────────┘                     │
│                                                                 │
│  SEARCH TAB:                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📄 orchestrator_universal.py:245                         │  │
│  │    def process_query(self, query: str) -> Response:      │  │
│  │    ├─ Callers: 12 | Callees: 8 | Similarity: 94%        │  │
│  │    └─ [View Code] [Show Graph] [Find Callers]           │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 📄 base_pipeline.py:89                                   │  │
│  │    class BasePipeline(ABC):                              │  │
│  │    ├─ Methods: 15 | Subclasses: 4 | Docs: 2             │  │
│  │    └─ [View Code] [Show Graph] [Find Implementations]   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  STATS TAB:                                                     │
│  ┌────────────┬────────────┬────────────┬────────────┐         │
│  │ Functions  │ Classes    │ Documents  │ Files      │         │
│  │  400,102   │  74,475    │  25,009    │  74,196    │         │
│  └────────────┴────────────┴────────────┴────────────┘         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Last Indexed: 2 hours ago | Next Cron: in 4 hours       │  │
│  │ [🔄 Re-index Now] [📊 View Cron Logs]                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Backend API Routes (Priority: High)

**New routes in `server/routes/docgraph.ts`:**

```typescript
// Search endpoints
GET  /api/docgraph/search?q=...&type=semantic|keyword&scope=...
GET  /api/docgraph/search/semantic?q=...&limit=20
GET  /api/docgraph/search/hybrid?q=...&limit=20

// Statistics endpoints
GET  /api/docgraph/stats
GET  /api/docgraph/stats/projects
GET  /api/docgraph/stats/recent-changes

// Code intelligence endpoints
GET  /api/docgraph/entity/:uuid
GET  /api/docgraph/callers/:uuid?depth=2
GET  /api/docgraph/callees/:uuid?depth=2
GET  /api/docgraph/explain/:uuid

// Index management
GET  /api/docgraph/index/status
POST /api/docgraph/index/trigger
GET  /api/docgraph/index/logs
```

**Implementation approach:**
1. Connect to Neo4j via bolt protocol
2. Connect to Milvus via gRPC
3. Use Gateway for embedding generation
4. Proxy to existing DocGraph MCP tools where possible

### Phase 2: Search UI Component (Priority: High)

**New component: `src/components/docgraph/SearchPanel.tsx`**

Features:
- Search input with debounced queries (300ms)
- Toggle between Semantic / Keyword / Regex modes
- Project scope filter dropdown
- Entity type filter (functions, classes, documents)
- Result cards with:
  - Syntax-highlighted code snippets
  - File path breadcrumbs
  - Caller/callee counts
  - Similarity score badge (for semantic)
- Pagination or infinite scroll

**Dependencies to add:**
- `@uiw/react-codemirror` - Syntax highlighting
- `react-syntax-highlighter` - Alternative for code blocks

### Phase 3: Statistics Dashboard (Priority: Medium)

**New component: `src/components/docgraph/StatsPanel.tsx`**

Metrics to display:
| Metric | Source | Update Frequency |
|--------|--------|------------------|
| Total entities by type | Neo4j COUNT query | On load |
| Entities by project | Neo4j GROUP BY | On load |
| Entities by language | Neo4j GROUP BY | On load |
| Last index time | Cron log file | Every 5 min |
| Index queue size | Incremental indexer | Every 5 min |
| Neo4j health | Bolt ping | Every 30 sec |
| Milvus health | gRPC ping | Every 30 sec |

**Visualizations:**
- Donut chart: Entities by type
- Bar chart: Entities by project
- Time series: Indexing activity (from logs)
- Status cards: Service health

### Phase 4: Graph Visualization (Priority: Medium)

**New component: `src/components/docgraph/GraphExplorer.tsx`**

Features:
- Interactive force-directed graph using `react-force-graph-2d`
- Node types: Function (blue), Class (green), Document (orange)
- Edge types: CALLS (solid), DOCUMENTS (dashed)
- Click node to expand neighbors
- Search to center on entity
- Depth slider (1-5)
- Export to PNG/SVG

**Layout modes:**
- Force-directed (default)
- Hierarchical (for call trees)
- Radial (for hub analysis)

### Phase 5: Browse Tab Enhancement (Priority: Low)

Enhance existing DocsTab:
- Add full-text search within current file tree
- Show file metadata (size, modified date)
- Add breadcrumb navigation
- Table of contents auto-generation for markdown
- Recent files quick access

---

## New Services to Track

### Add to `ecosystem.sh` and Dashboard Health Checks

| Service | Port | Health Endpoint | Priority |
|---------|------|-----------------|----------|
| **MinIO** | 9000 | `/minio/health/live` | High |
| **MinIO Console** | 9001 | `/` | Low |
| **etcd** | 2379 | `/health` | Medium |
| **Neo4j** | 7474 | `/` | High |
| **Milvus WebUI** | 9091 | `/healthz` | High |

### Update `config/ports.ts`

```typescript
// Add to existing exports
export const NEO4J_HTTP_PORT = 7474
export const NEO4J_BOLT_PORT = 7687
export const ETCD_PORT = 2379

// Add health check services
{ name: 'Neo4j', port: 7474, healthEndpoint: '/', type: 'http' },
{ name: 'MinIO', port: 9000, healthEndpoint: '/minio/health/live', type: 'http' },
{ name: 'etcd', port: 2379, healthEndpoint: '/health', type: 'http' },
```

### Update `ecosystem.sh`

Add to health check section:
```bash
# MCP Infrastructure
check_service "Neo4j" 7474 "/"
check_service "Milvus" 9091 "/healthz"
check_service "MinIO" 9000 "/minio/health/live"
check_tcp "etcd" 2379
```

---

## API Response Formats

### Search Results
```typescript
interface SearchResult {
  uuid: string
  entity_type: 'function' | 'class' | 'document'
  name: string
  qualified_name: string
  file_path: string
  project: string
  content_snippet: string
  similarity_score?: number  // 0-1 for semantic search
  caller_count?: number
  callee_count?: number
  line_start?: number
  line_end?: number
}
```

### Statistics
```typescript
interface DocGraphStats {
  entities: {
    functions: number
    classes: number
    documents: number
    files: number
  }
  projects: Array<{ name: string; count: number }>
  lastIndexed: string  // ISO timestamp
  indexHealth: 'healthy' | 'stale' | 'error'
  services: {
    neo4j: 'up' | 'down'
    milvus: 'up' | 'down'
    gateway: 'up' | 'down'
  }
}
```

---

## File Structure

```
src/components/
├── docgraph/
│   ├── index.ts              # Barrel export
│   ├── SearchPanel.tsx       # Main search interface
│   ├── SearchResults.tsx     # Result cards
│   ├── StatsPanel.tsx        # Statistics dashboard
│   ├── GraphExplorer.tsx     # Interactive graph
│   ├── EntityCard.tsx        # Reusable entity display
│   ├── CodeSnippet.tsx       # Syntax-highlighted code
│   └── FilterBar.tsx         # Search filters
├── tabs/
│   └── CodeIntelligenceTab.tsx  # New main tab (replaces/extends DocsTab)

server/routes/
├── docgraph.ts               # New API routes

src/stores/
├── docgraphStore.ts          # Zustand store for search state

src/hooks/
├── useDocGraphSearch.ts      # React Query hook for search
├── useDocGraphStats.ts       # React Query hook for stats
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "neo4j-driver": "^5.x",
    "@zilliz/milvus2-sdk-node": "^2.x",
    "react-force-graph-2d": "^1.x",
    "react-syntax-highlighter": "^15.x"
  }
}
```

---

## Estimated Effort

| Phase | Components | Effort |
|-------|------------|--------|
| Phase 1 | Backend APIs | 2-3 sessions |
| Phase 2 | Search UI | 2-3 sessions |
| Phase 3 | Stats Dashboard | 1-2 sessions |
| Phase 4 | Graph Explorer | 2-3 sessions |
| Phase 5 | Browse Enhancement | 1 session |
| **Total** | | **8-12 sessions** |

---

## Success Criteria

1. **Search**: Users can find code entities by semantic query in <2 seconds
2. **Stats**: Dashboard shows real-time indexing statistics
3. **Graph**: Users can explore code relationships visually
4. **Health**: All DocGraph services monitored in ecosystem health checks
5. **Performance**: Search results return in <500ms for 90% of queries

---

## Next Steps

1. [ ] Add Neo4j, MinIO, etcd to ecosystem.sh health checks
2. [x] Create `server/routes/docgraph.ts` with basic endpoints *(completed 2026-01-18)*
3. [x] Implement search API connecting to Neo4j/Milvus *(completed 2026-01-18)*
4. [x] Build SearchPanel component with result cards *(completed 2026-01-18)*
5. [x] Add StatsPanel with entity counts *(completed 2026-01-18)*
6. [x] Integrate GraphExplorer with force-directed layout *(completed 2026-01-19)*
7. [x] Create CodeIntelligenceTab with sub-tabs *(completed 2026-01-18)*
8. [x] Add source code viewer with syntax highlighting *(completed 2026-01-19)*
9. [x] Add resizable detail panel *(completed 2026-01-19)*

---

*Plan created: 2026-01-18 by Claude Code*
