# Unified System Dashboard

> **Created**: 2026-01-03 | **Updated**: 2026-01-07 | **Port**: 3100 | **Version**: 0.2.0

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

### Dependent Services

| Service | Location | Management Script |
|---------|----------|-------------------|
| memOS | `Recovery_Bot/memOS/server/` | `./start_server.sh` |
| PDF Tools | `PDF_Extraction_Tools/` | `./api_server.sh` |
| Ollama | System service | `scripts/ollama.sh` |
| Docker containers | Docker | `scripts/docker-services.sh` |

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
│   │   └── tabs/        # Main tab views
│   ├── hooks/           # Custom React hooks
│   ├── stores/          # Zustand stores
│   └── lib/             # Utilities, API client
├── server/
│   ├── routes/          # Express routes
│   │   ├── health.ts    # Health aggregation
│   │   ├── gpu.ts       # GPU status proxy
│   │   ├── logs.ts      # Log collection
│   │   ├── docs.ts      # Documentation server
│   │   └── processes.ts # Process monitoring
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

| Tool | Command | Purpose |
|------|---------|---------|
| **Search code** | `kit search /home/sparkone/sdd/unified_dashboard "query"` | Find code patterns |
| **File tree** | `kit file-tree /home/sparkone/sdd/unified_dashboard` | View structure |
| **Re-index** | `/home/sparkone/sdd/mcp_infrastructure/scripts/index_ecosystem.sh` | Refresh after major changes |

---

*Last Updated: 2026-01-07 | Added ecosystem orchestration and CLI documentation*
