#!/bin/bash
#
# RecoveryBot Ecosystem Orchestration Script
#
# Manages all services required by the Unified Dashboard and RecoveryBot Android client.
#
# Usage:
#   ./ecosystem.sh start [--parallel]     - Start all services
#   ./ecosystem.sh stop                   - Stop all services
#   ./ecosystem.sh restart [--parallel]   - Restart all services
#   ./ecosystem.sh status                 - Show status of all services
#   ./ecosystem.sh health                 - Deep health check all services
#   ./ecosystem.sh logs <service>         - View logs for a service
#   ./ecosystem.sh help                   - Show this help
#

set -e

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ECOSYSTEM_ROOT="/home/sparkone/sdd"

# Service directories
UNIFIED_DASHBOARD="$ECOSYSTEM_ROOT/unified_dashboard"
MEMOS_SERVER="$ECOSYSTEM_ROOT/Recovery_Bot/memOS/server"
PDF_TOOLS="$ECOSYSTEM_ROOT/PDF_Extraction_Tools"
HRM_MODEL="$ECOSYSTEM_ROOT/HRM_Model"
RECOVERY_BOT="$ECOSYSTEM_ROOT/Recovery_Bot"

# Log file
LOG_FILE="$SCRIPT_DIR/ecosystem.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Service definitions (name:port:health_endpoint:type)
declare -A SERVICES
SERVICES=(
    ["docker"]="0:0:docker:system"
    ["ollama"]="11434:/api/version:ollama:systemctl"
    ["postgres"]="5432:pg_isready:postgres:docker"
    ["redis"]="6379:redis-ping:redis:docker"
    ["searxng"]="8888:/healthz:searxng:docker"
    ["memos"]="8001:/api/v1/health:memos:python"
    ["pdf-tools"]="8002:/health:pdf-tools:python"
    ["docling"]="8003:/:docling:docker"
    ["dashboard"]="3100:/:dashboard:node"
)

# Service start order (dependencies first)
SERVICE_ORDER=(
    "docker"
    "ollama"
    "postgres"
    "redis"
    "searxng"
    "docling"
    "pdf-tools"
    "memos"
    "dashboard"
)

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1" >> "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1" >> "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" >> "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"
}

log_header() {
    echo ""
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

log_subheader() {
    echo -e "${BOLD}${MAGENTA}── $1 ──${NC}"
}

# Parse service definition
get_service_port() { echo "${SERVICES[$1]}" | cut -d: -f1; }
get_service_health() { echo "${SERVICES[$1]}" | cut -d: -f2; }
get_service_name() { echo "${SERVICES[$1]}" | cut -d: -f3; }
get_service_type() { echo "${SERVICES[$1]}" | cut -d: -f4; }

# Check if a port is in use
port_in_use() {
    local port=$1
    lsof -i:$port -t >/dev/null 2>&1
}

# Get process info for a port
get_port_user() {
    local port=$1
    lsof -i:$port -t 2>/dev/null | head -1 | xargs -I{} ps -p {} -o pid,comm --no-headers 2>/dev/null || echo "unknown"
}

# Check port availability and warn if in use
check_port_available() {
    local port=$1
    local service=$2
    if port_in_use "$port"; then
        local user=$(get_port_user "$port")
        log_warning "Port $port is already in use by: $user"
        return 1
    fi
    return 0
}

# Show recent log output for debugging
show_startup_error() {
    local log_file=$1
    local service_name=$2
    local lines=${3:-20}

    echo ""
    echo -e "${RED}━━━ $service_name Startup Error Details ━━━${NC}"
    if [ -f "$log_file" ]; then
        echo -e "${YELLOW}Last $lines lines of $log_file:${NC}"
        tail -n "$lines" "$log_file" 2>/dev/null | sed 's/^/  /'
    else
        echo -e "${YELLOW}No log file found at: $log_file${NC}"
    fi
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Wait for a service to be ready
wait_for_service() {
    local name=$1
    local port=$2
    local health=$3
    local timeout=${4:-60}
    local start_time=$(date +%s)

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -ge $timeout ]; then
            return 1
        fi

        # Check health based on type
        case "$health" in
            /*)
                # Use localhost to handle both IPv4 and IPv6 binding
                if curl -s "http://localhost:$port$health" >/dev/null 2>&1; then
                    return 0
                fi
                ;;
            pg_isready)
                # Try host command first, fall back to docker exec
                if command -v pg_isready >/dev/null 2>&1; then
                    if pg_isready -h 127.0.0.1 -p $port >/dev/null 2>&1; then
                        return 0
                    fi
                elif docker exec memos-postgres pg_isready -U postgres >/dev/null 2>&1; then
                    return 0
                fi
                ;;
            redis-ping)
                # Try host command first, fall back to docker exec
                if command -v redis-cli >/dev/null 2>&1; then
                    if redis-cli -p $port ping 2>/dev/null | grep -q PONG; then
                        return 0
                    fi
                elif docker exec memos-redis redis-cli ping 2>/dev/null | grep -q PONG; then
                    return 0
                fi
                ;;
            docker)
                if docker info >/dev/null 2>&1; then
                    return 0
                fi
                ;;
            *)
                if port_in_use $port; then
                    return 0
                fi
                ;;
        esac

        sleep 2
    done
}

# ============================================================================
# Service Management Functions
# ============================================================================

start_docker() {
    log_subheader "Docker Engine"
    if docker info >/dev/null 2>&1; then
        log_success "Docker is already running"
        return 0
    fi

    log_info "Starting Docker..."
    sudo systemctl start docker
    sleep 3

    if docker info >/dev/null 2>&1; then
        log_success "Docker started"
    else
        log_error "Failed to start Docker"
        return 1
    fi
}

stop_docker() {
    log_subheader "Docker Engine"
    log_warning "Docker stop skipped (would affect all containers)"
}

start_ollama() {
    log_subheader "Ollama LLM Service (port 11434)"
    if systemctl is-active --quiet ollama; then
        log_success "Ollama is already running"
        return 0
    fi

    log_info "Starting Ollama..."
    sudo systemctl start ollama

    if wait_for_service "ollama" 11434 "/api/version" 30; then
        log_success "Ollama started"
    else
        log_error "Ollama failed to start"
        return 1
    fi
}

stop_ollama() {
    log_subheader "Ollama LLM Service"
    if ! systemctl is-active --quiet ollama; then
        log_warning "Ollama is not running"
        return 0
    fi

    log_info "Stopping Ollama..."
    sudo systemctl stop ollama
    log_success "Ollama stopped"
}

start_postgres() {
    log_subheader "PostgreSQL Database (port 5432)"
    if docker ps --format '{{.Names}}' | grep -q "memos-postgres"; then
        log_success "PostgreSQL (memos-postgres) is already running"
        return 0
    fi

    log_info "Starting PostgreSQL container..."
    docker start memos-postgres 2>/dev/null || {
        log_warning "Container memos-postgres doesn't exist, trying docker-compose..."
        cd "$RECOVERY_BOT/memOS" && docker-compose up -d postgres 2>/dev/null
    }

    if wait_for_service "postgres" 5432 "pg_isready" 30; then
        log_success "PostgreSQL started"
    else
        log_error "PostgreSQL failed to start"
        return 1
    fi
}

stop_postgres() {
    log_subheader "PostgreSQL Database"
    if docker ps --format '{{.Names}}' | grep -q "memos-postgres"; then
        log_info "Stopping PostgreSQL container..."
        docker stop memos-postgres
        log_success "PostgreSQL stopped"
    else
        log_warning "PostgreSQL container not running"
    fi
}

start_redis() {
    log_subheader "Redis Cache (port 6379)"
    if docker ps --format '{{.Names}}' | grep -q "memos-redis"; then
        log_success "Redis (memos-redis) is already running"
        return 0
    fi

    log_info "Starting Redis container..."
    docker start memos-redis 2>/dev/null || {
        log_warning "Container memos-redis doesn't exist, trying docker-compose..."
        cd "$RECOVERY_BOT/memOS" && docker-compose up -d redis 2>/dev/null
    }

    if wait_for_service "redis" 6379 "redis-ping" 30; then
        log_success "Redis started"
    else
        log_error "Redis failed to start"
        return 1
    fi
}

stop_redis() {
    log_subheader "Redis Cache"
    if docker ps --format '{{.Names}}' | grep -q "memos-redis"; then
        log_info "Stopping Redis container..."
        docker stop memos-redis
        log_success "Redis stopped"
    else
        log_warning "Redis container not running"
    fi
}

start_searxng() {
    log_subheader "SearXNG Metasearch (port 8888)"
    if docker ps --format '{{.Names}}' | grep -q "^searxng$"; then
        log_success "SearXNG is already running"
        return 0
    fi

    log_info "Starting SearXNG containers..."
    # Start the SearXNG stack
    local searxng_containers=("searxng" "searxng-redis" "searxng-meilisearch" "searxng-qdrant" "searxng-tor")
    for container in "${searxng_containers[@]}"; do
        docker start "$container" 2>/dev/null || true
    done

    if wait_for_service "searxng" 8888 "/healthz" 60; then
        log_success "SearXNG started"
    else
        log_error "SearXNG failed to start"
        return 1
    fi
}

stop_searxng() {
    log_subheader "SearXNG Metasearch"
    local searxng_containers=("searxng" "searxng-redis" "searxng-meilisearch" "searxng-qdrant" "searxng-tor")
    for container in "${searxng_containers[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            log_info "Stopping $container..."
            docker stop "$container"
        fi
    done
    log_success "SearXNG stack stopped"
}

start_docling() {
    log_subheader "Docling Document Processor (port 8003)"
    if docker ps --format '{{.Names}}' | grep -q "memos-docling"; then
        log_success "Docling is already running"
        return 0
    fi

    log_info "Starting Docling container..."
    docker start memos-docling 2>/dev/null || {
        log_warning "Container memos-docling doesn't exist"
        return 1
    }

    if wait_for_service "docling" 8003 "/" 60; then
        log_success "Docling started"
    else
        log_error "Docling failed to start"
        return 1
    fi
}

stop_docling() {
    log_subheader "Docling Document Processor"
    if docker ps --format '{{.Names}}' | grep -q "memos-docling"; then
        log_info "Stopping Docling container..."
        docker stop memos-docling
        log_success "Docling stopped"
    else
        log_warning "Docling container not running"
    fi
}

start_pdf_tools() {
    log_subheader "PDF Extraction Tools API (port 8002)"
    if curl -s "http://127.0.0.1:8002/health" >/dev/null 2>&1; then
        log_success "PDF Tools API is already running"
        return 0
    fi

    # Check if port is available
    if ! check_port_available 8002 "PDF Tools"; then
        log_error "Cannot start PDF Tools - port 8002 in use"
        return 1
    fi

    # Check if directory and script exist
    if [ ! -d "$PDF_TOOLS" ]; then
        log_error "PDF Tools directory not found: $PDF_TOOLS"
        return 1
    fi

    if [ ! -x "$PDF_TOOLS/api_server.sh" ]; then
        log_error "PDF Tools start script not found: $PDF_TOOLS/api_server.sh"
        return 1
    fi

    log_info "Starting PDF Tools API..."
    cd "$PDF_TOOLS"

    # Create startup log
    local pdf_log="$PDF_TOOLS/startup.log"
    echo "=== PDF Tools startup at $(date) ===" > "$pdf_log"

    ./api_server.sh start --domain full >> "$pdf_log" 2>&1 &
    local pid=$!
    log_info "Started PDF Tools launcher (PID: $pid)"

    if wait_for_service "pdf-tools" 8002 "/health" 120; then
        log_success "PDF Tools API started (graph loading may take time)"
    else
        log_error "PDF Tools API failed to start"
        if [ -f "$pdf_log" ]; then
            show_startup_error "$pdf_log" "PDF Tools" 30
        fi
        # Check for API log
        if [ -f "$PDF_TOOLS/api.log" ]; then
            echo -e "${YELLOW}Recent api.log:${NC}"
            tail -20 "$PDF_TOOLS/api.log" 2>/dev/null | sed 's/^/  /'
        fi
        return 1
    fi
}

stop_pdf_tools() {
    log_subheader "PDF Extraction Tools API"
    if [ -x "$PDF_TOOLS/api_server.sh" ]; then
        cd "$PDF_TOOLS"
        ./api_server.sh stop
        log_success "PDF Tools API stopped"
    else
        log_warning "PDF Tools script not found"
    fi
}

start_memos() {
    log_subheader "memOS Server (port 8001)"
    if curl -s "http://localhost:8001/api/v1/system/health/aggregate" 2>/dev/null | grep -q '"success":true'; then
        log_success "memOS is already running"
        return 0
    fi

    # Check if port is available
    if ! check_port_available 8001 "memOS"; then
        log_error "Cannot start memOS - port 8001 in use"
        return 1
    fi

    # Check if server directory exists
    if [ ! -d "$MEMOS_SERVER" ]; then
        log_error "memOS server directory not found: $MEMOS_SERVER"
        return 1
    fi

    if [ ! -x "$MEMOS_SERVER/start_server.sh" ]; then
        log_error "memOS start script not found or not executable: $MEMOS_SERVER/start_server.sh"
        return 1
    fi

    log_info "Starting memOS server..."
    cd "$MEMOS_SERVER"

    # Create/clear a startup log
    local memos_log="$MEMOS_SERVER/startup.log"
    echo "=== memOS startup at $(date) ===" > "$memos_log"

    # Start and capture output
    ./start_server.sh >> "$memos_log" 2>&1 &
    local pid=$!
    log_info "Started memOS launcher (PID: $pid)"

    # Give it time to spawn
    sleep 3

    # Use root endpoint for basic availability check (returns HTML)
    if wait_for_service "memos" 8001 "/" 60; then
        log_success "memOS started"
    else
        log_error "memOS failed to start within timeout"
        # Try to show any available logs
        if [ -f "$memos_log" ]; then
            show_startup_error "$memos_log" "memOS" 30
        fi
        # Also check for nohup.out or app.log
        if [ -f "$MEMOS_SERVER/nohup.out" ]; then
            echo -e "${YELLOW}Recent nohup.out:${NC}"
            tail -20 "$MEMOS_SERVER/nohup.out" 2>/dev/null | sed 's/^/  /'
        fi
        if [ -f "$MEMOS_SERVER/app.log" ]; then
            echo -e "${YELLOW}Recent app.log:${NC}"
            tail -20 "$MEMOS_SERVER/app.log" 2>/dev/null | sed 's/^/  /'
        fi
        return 1
    fi
}

stop_memos() {
    log_subheader "memOS Server"
    if [ -x "$MEMOS_SERVER/stop_server.sh" ]; then
        cd "$MEMOS_SERVER"
        ./stop_server.sh
        log_success "memOS stopped"
    else
        log_warning "memOS stop script not found"
    fi
}

start_dashboard() {
    log_subheader "Unified Dashboard (port 3100/3101)"
    # Use localhost to handle both IPv4 and IPv6 binding
    # Check BOTH frontend (3100) AND backend (3101) - both must be running
    local frontend_up=false
    local backend_up=false

    if curl -s "http://localhost:3100" >/dev/null 2>&1; then
        frontend_up=true
    fi

    if curl -s "http://localhost:3101/api/health/aggregate" >/dev/null 2>&1; then
        backend_up=true
    fi

    if [ "$frontend_up" = true ] && [ "$backend_up" = true ]; then
        log_success "Dashboard is already running (frontend + backend)"
        return 0
    elif [ "$frontend_up" = true ] && [ "$backend_up" = false ]; then
        log_warning "Dashboard frontend running but backend is DOWN - restarting..."
        # Kill the orphaned frontend
        local frontend_pids=$(lsof -i:3100 -t 2>/dev/null)
        if [ -n "$frontend_pids" ]; then
            echo "$frontend_pids" | xargs kill -TERM 2>/dev/null || true
            sleep 2
        fi
    elif [ "$frontend_up" = false ] && [ "$backend_up" = true ]; then
        log_warning "Dashboard backend running but frontend is DOWN - restarting..."
        # Kill the orphaned backend
        local backend_pids=$(lsof -i:3101 -t 2>/dev/null)
        if [ -n "$backend_pids" ]; then
            echo "$backend_pids" | xargs kill -TERM 2>/dev/null || true
            sleep 2
        fi
    fi

    # Check if ports are available
    local port_conflict=false
    if ! check_port_available 3100 "Dashboard Frontend"; then
        port_conflict=true
    fi
    if ! check_port_available 3101 "Dashboard Backend"; then
        port_conflict=true
    fi

    if [ "$port_conflict" = true ]; then
        log_error "Cannot start Dashboard - ports in use"
        log_info "Try: lsof -i:3100 -i:3101 to see what's using the ports"
        log_info "Or:  kill \$(lsof -i:3100 -i:3101 -t) to free them"
        return 1
    fi

    log_info "Starting Unified Dashboard..."
    cd "$UNIFIED_DASHBOARD"

    # Check node_modules
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install 2>&1 | tee -a "$UNIFIED_DASHBOARD/dashboard.log"
        if [ ${PIPESTATUS[0]} -ne 0 ]; then
            log_error "npm install failed"
            show_startup_error "$UNIFIED_DASHBOARD/dashboard.log" "Dashboard" 30
            return 1
        fi
    fi

    # Clear previous log for clean startup
    echo "=== Dashboard startup at $(date) ===" > "$UNIFIED_DASHBOARD/dashboard.log"

    # Start in background and capture startup output
    nohup npm run start >> "$UNIFIED_DASHBOARD/dashboard.log" 2>&1 &
    local pid=$!
    log_info "Started process with PID: $pid"

    # Give it a moment to fail fast if there's an immediate issue
    sleep 3

    # Check if process is still running
    if ! kill -0 $pid 2>/dev/null; then
        log_error "Dashboard process died immediately"
        show_startup_error "$UNIFIED_DASHBOARD/dashboard.log" "Dashboard" 40
        return 1
    fi

    # Wait for frontend first
    if ! wait_for_service "dashboard-frontend" 3100 "/" 60; then
        log_error "Dashboard frontend failed to start within timeout"
        if kill -0 $pid 2>/dev/null; then
            log_warning "Process $pid is still running but frontend not responding"
        else
            log_error "Process $pid has exited"
        fi
        show_startup_error "$UNIFIED_DASHBOARD/dashboard.log" "Dashboard" 40
        return 1
    fi
    log_success "Frontend started: http://localhost:3100"

    # Wait for backend (may take a few more seconds)
    if ! wait_for_service "dashboard-backend" 3101 "/api/health/aggregate" 30; then
        log_error "Dashboard backend failed to start within timeout"
        log_warning "Frontend is up but backend is not responding on port 3101"
        show_startup_error "$UNIFIED_DASHBOARD/dashboard.log" "Dashboard" 40
        return 1
    fi
    log_success "Backend started:  http://localhost:3101"

    log_success "Dashboard fully started (frontend + backend)"
}

stop_dashboard() {
    log_subheader "Unified Dashboard"

    # Find and kill processes on ports 3100 and 3101
    local pids=$(lsof -i:3100 -i:3101 -t 2>/dev/null)
    if [ -n "$pids" ]; then
        log_info "Stopping Dashboard processes..."
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        sleep 2
        echo "$pids" | xargs kill -9 2>/dev/null || true
        log_success "Dashboard stopped"
    else
        log_warning "Dashboard is not running"
    fi
}

# ============================================================================
# Command Implementations
# ============================================================================

cmd_start() {
    local parallel=false
    if [[ "$1" == "--parallel" ]]; then
        parallel=true
    fi

    log_header "Starting RecoveryBot Ecosystem"

    local failed=0

    for service in "${SERVICE_ORDER[@]}"; do
        case "$service" in
            docker) start_docker || ((failed++)) ;;
            ollama) start_ollama || ((failed++)) ;;
            postgres) start_postgres || ((failed++)) ;;
            redis) start_redis || ((failed++)) ;;
            searxng) start_searxng || ((failed++)) ;;
            docling) start_docling || ((failed++)) ;;
            pdf-tools) start_pdf_tools || ((failed++)) ;;
            memos) start_memos || ((failed++)) ;;
            dashboard) start_dashboard || ((failed++)) ;;
        esac
        echo ""
    done

    log_header "Startup Summary"
    if [ $failed -eq 0 ]; then
        log_success "All services started successfully!"
    else
        log_warning "$failed service(s) failed to start"
    fi

    echo ""
    cmd_status
}

cmd_stop() {
    log_header "Stopping RecoveryBot Ecosystem"

    # Stop in reverse order
    local reversed=()
    for ((i=${#SERVICE_ORDER[@]}-1; i>=0; i--)); do
        reversed+=("${SERVICE_ORDER[$i]}")
    done

    for service in "${reversed[@]}"; do
        case "$service" in
            dashboard) stop_dashboard ;;
            memos) stop_memos ;;
            pdf-tools) stop_pdf_tools ;;
            docling) stop_docling ;;
            searxng) stop_searxng ;;
            redis) stop_redis ;;
            postgres) stop_postgres ;;
            ollama) stop_ollama ;;
            docker) stop_docker ;;
        esac
    done

    log_header "Shutdown Complete"
    log_success "All services stopped"
}

cmd_restart() {
    cmd_stop
    echo ""
    sleep 3
    cmd_start "$@"
}

cmd_status() {
    log_header "RecoveryBot Ecosystem Status"

    printf "%-15s %-8s %-10s %s\n" "SERVICE" "PORT" "STATUS" "DETAILS"
    printf "%-15s %-8s %-10s %s\n" "───────────" "────────" "──────────" "────────────────────"

    # Docker
    if docker info >/dev/null 2>&1; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "docker" "-" "running" "$(docker ps -q | wc -l) containers"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "docker" "-" "stopped" ""
    fi

    # Ollama
    if systemctl is-active --quiet ollama 2>/dev/null; then
        local models=$(curl -s http://localhost:11434/api/tags 2>/dev/null | jq -r '.models | length' 2>/dev/null || echo "?")
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "ollama" "11434" "running" "$models models loaded"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "ollama" "11434" "stopped" ""
    fi

    # PostgreSQL
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "memos-postgres"; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "postgres" "5432" "running" "memos-postgres"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "postgres" "5432" "stopped" ""
    fi

    # Redis
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "memos-redis"; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "redis" "6379" "running" "memos-redis"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "redis" "6379" "stopped" ""
    fi

    # SearXNG
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^searxng$"; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "searxng" "8888" "running" "metasearch"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "searxng" "8888" "stopped" ""
    fi

    # Docling
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "memos-docling"; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "docling" "8003" "running" "document processor"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "docling" "8003" "stopped" ""
    fi

    # PDF Tools
    if curl -s "http://127.0.0.1:8002/health" 2>/dev/null | grep -q '"success"'; then
        local nodes=$(curl -s "http://127.0.0.1:8002/health" 2>/dev/null | jq -r '.data.num_documents' 2>/dev/null || echo "?")
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "pdf-tools" "8002" "running" "$nodes nodes"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "pdf-tools" "8002" "stopped" ""
    fi

    # memOS (check aggregate health endpoint)
    if curl -s "http://localhost:8001/api/v1/system/health/aggregate" 2>/dev/null | grep -q '"success":true'; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "memos" "8001" "running" "agentic search"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "memos" "8001" "stopped" ""
    fi

    # Dashboard (check both frontend and backend)
    local dash_frontend="stopped"
    local dash_backend="stopped"
    local dash_details=""

    if curl -s "http://localhost:3100" >/dev/null 2>&1; then
        dash_frontend="up"
    fi

    if curl -s "http://localhost:3101/api/health/aggregate" >/dev/null 2>&1; then
        dash_backend="up"
    fi

    if [ "$dash_frontend" = "up" ] && [ "$dash_backend" = "up" ]; then
        printf "%-15s %-8s ${GREEN}%-10s${NC} %s\n" "dashboard" "3100" "running" "frontend+backend OK"
    elif [ "$dash_frontend" = "up" ] && [ "$dash_backend" = "stopped" ]; then
        printf "%-15s %-8s ${YELLOW}%-10s${NC} %s\n" "dashboard" "3100" "partial" "frontend OK, backend DOWN"
    elif [ "$dash_frontend" = "stopped" ] && [ "$dash_backend" = "up" ]; then
        printf "%-15s %-8s ${YELLOW}%-10s${NC} %s\n" "dashboard" "3101" "partial" "backend OK, frontend DOWN"
    else
        printf "%-15s %-8s ${RED}%-10s${NC} %s\n" "dashboard" "3100" "stopped" ""
    fi

    echo ""
}

cmd_health() {
    log_header "Deep Health Check"

    local passed=0
    local failed=0
    local warnings=0

    # Docker
    echo -e "${BOLD}Docker:${NC}"
    if docker info >/dev/null 2>&1; then
        log_success "Docker engine healthy"
        passed=$((passed + 1))
    else
        log_error "Docker engine not running"
        failed=$((failed + 1))
    fi
    echo ""

    # Ollama
    echo -e "${BOLD}Ollama (11434):${NC}"
    local ollama_health=$(curl -s "http://localhost:11434/api/version" 2>/dev/null)
    if [ -n "$ollama_health" ]; then
        echo "$ollama_health" | jq . 2>/dev/null || echo "$ollama_health"
        log_success "Ollama healthy"
        passed=$((passed + 1))
    else
        log_error "Ollama not responding"
        failed=$((failed + 1))
    fi
    echo ""

    # PostgreSQL
    echo -e "${BOLD}PostgreSQL (5432):${NC}"
    # Try pg_isready first, fall back to docker exec if not installed
    if command -v pg_isready >/dev/null 2>&1; then
        if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
            log_success "PostgreSQL accepting connections"
            passed=$((passed + 1))
        else
            log_error "PostgreSQL not accepting connections"
            failed=$((failed + 1))
        fi
    elif docker ps --format '{{.Names}}' | grep -q "memos-postgres"; then
        if docker exec memos-postgres pg_isready -U postgres >/dev/null 2>&1; then
            log_success "PostgreSQL accepting connections (via docker)"
            passed=$((passed + 1))
        else
            log_error "PostgreSQL container not ready"
            failed=$((failed + 1))
        fi
    else
        log_error "PostgreSQL container not running"
        failed=$((failed + 1))
    fi
    echo ""

    # Redis
    echo -e "${BOLD}Redis (6379):${NC}"
    # Try redis-cli first, fall back to docker exec if not installed
    if command -v redis-cli >/dev/null 2>&1; then
        local redis_ping=$(redis-cli -p 6379 ping 2>/dev/null)
        if [ "$redis_ping" = "PONG" ]; then
            log_success "Redis responding to PING"
            passed=$((passed + 1))
        else
            log_error "Redis not responding"
            failed=$((failed + 1))
        fi
    elif docker ps --format '{{.Names}}' | grep -q "memos-redis"; then
        local redis_ping=$(docker exec memos-redis redis-cli ping 2>/dev/null)
        if [ "$redis_ping" = "PONG" ]; then
            log_success "Redis responding to PING (via docker)"
            passed=$((passed + 1))
        else
            log_error "Redis container not ready"
            failed=$((failed + 1))
        fi
    else
        log_error "Redis container not running"
        failed=$((failed + 1))
    fi
    echo ""

    # SearXNG
    echo -e "${BOLD}SearXNG (8888):${NC}"
    if curl -s "http://localhost:8888/healthz" >/dev/null 2>&1; then
        log_success "SearXNG healthy"
        passed=$((passed + 1))
    else
        log_warning "SearXNG not responding (optional service)"
        warnings=$((warnings + 1))
    fi
    echo ""

    # PDF Tools
    echo -e "${BOLD}PDF Tools (8002):${NC}"
    local pdf_health=$(curl -s "http://localhost:8002/health" 2>/dev/null)
    if echo "$pdf_health" | grep -q '"success": true'; then
        echo "$pdf_health" | jq -r '.data | "  Status: \(.status)\n  Nodes: \(.num_documents)\n  Ollama: \(.ollama_available)"' 2>/dev/null
        log_success "PDF Tools healthy"
        passed=$((passed + 1))
    else
        log_error "PDF Tools not responding"
        failed=$((failed + 1))
    fi
    echo ""

    # memOS
    echo -e "${BOLD}memOS (8001):${NC}"
    local memos_health=$(curl -s "http://localhost:8001/api/v1/system/health/aggregate" 2>/dev/null)
    if echo "$memos_health" | grep -q '"success":true'; then
        echo "$memos_health" | jq -r '.data.subsystems[] | "  \(.name): \(.status)"' 2>/dev/null | head -5
        log_success "memOS healthy"
        passed=$((passed + 1))
    else
        log_error "memOS not responding"
        failed=$((failed + 1))
    fi
    echo ""

    # Dashboard (check both frontend and backend)
    echo -e "${BOLD}Dashboard (3100/3101):${NC}"
    local dash_fe_ok=false
    local dash_be_ok=false

    if curl -s "http://localhost:3100" >/dev/null 2>&1; then
        log_success "Frontend (3100) responding"
        dash_fe_ok=true
    else
        log_error "Frontend (3100) not responding"
    fi

    if curl -s "http://localhost:3101/api/health/aggregate" >/dev/null 2>&1; then
        log_success "Backend (3101) responding"
        dash_be_ok=true
    else
        log_error "Backend (3101) not responding"
    fi

    if [ "$dash_fe_ok" = true ] && [ "$dash_be_ok" = true ]; then
        passed=$((passed + 1))
    else
        failed=$((failed + 1))
    fi
    echo ""

    log_header "Health Summary"
    echo -e "Passed:   ${GREEN}$passed${NC}"
    echo -e "Failed:   ${RED}$failed${NC}"
    echo -e "Warnings: ${YELLOW}$warnings${NC}"
    echo ""

    if [ $failed -eq 0 ]; then
        log_success "All critical services healthy!"
        return 0
    else
        log_error "Some services have issues"
        return 1
    fi
}

cmd_logs() {
    local service=$1

    if [ -z "$service" ]; then
        echo "Usage: $0 logs <service>"
        echo ""
        echo "Available services:"
        echo "  dashboard  - Unified Dashboard logs"
        echo "  memos      - memOS server logs"
        echo "  pdf-tools  - PDF Extraction Tools logs"
        echo "  ollama     - Ollama LLM logs"
        echo "  postgres   - PostgreSQL logs"
        echo "  redis      - Redis logs"
        echo "  searxng    - SearXNG logs"
        echo "  docling    - Docling processor logs"
        return 1
    fi

    case "$service" in
        dashboard)
            tail -f "$UNIFIED_DASHBOARD/dashboard.log" 2>/dev/null || log_error "No dashboard logs found"
            ;;
        memos)
            cd "$MEMOS_SERVER" && ./logs_server.sh
            ;;
        pdf-tools)
            cd "$PDF_TOOLS" && ./api_server.sh tail
            ;;
        ollama)
            journalctl -u ollama -f
            ;;
        postgres)
            docker logs -f memos-postgres
            ;;
        redis)
            docker logs -f memos-redis
            ;;
        searxng)
            docker logs -f searxng
            ;;
        docling)
            docker logs -f memos-docling
            ;;
        *)
            log_error "Unknown service: $service"
            return 1
            ;;
    esac
}

cmd_diagnose() {
    log_header "Ecosystem Diagnostics"

    echo -e "${BOLD}Port Usage:${NC}"
    echo "Checking ports used by ecosystem services..."
    echo ""
    printf "%-10s %-8s %-20s\n" "PORT" "STATUS" "PROCESS"
    printf "%-10s %-8s %-20s\n" "────────" "──────" "────────────────────"

    for port in 3100 3101 8001 8002 8003 8888 5432 6379 11434; do
        if port_in_use $port; then
            local proc=$(get_port_user $port)
            printf "%-10s ${GREEN}%-8s${NC} %s\n" "$port" "in use" "$proc"
        else
            printf "%-10s ${YELLOW}%-8s${NC} %s\n" "$port" "free" "-"
        fi
    done

    echo ""
    echo -e "${BOLD}Docker Containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -15 || echo "Docker not available"

    echo ""
    echo -e "${BOLD}Recent Ecosystem Log:${NC}"
    if [ -f "$LOG_FILE" ]; then
        tail -15 "$LOG_FILE"
    else
        echo "No ecosystem log found"
    fi

    echo ""
    echo -e "${BOLD}Dashboard Log (last 10 lines):${NC}"
    if [ -f "$UNIFIED_DASHBOARD/dashboard.log" ]; then
        tail -10 "$UNIFIED_DASHBOARD/dashboard.log"
    else
        echo "No dashboard log found"
    fi

    echo ""
    echo -e "${BOLD}Disk Space:${NC}"
    df -h "$ECOSYSTEM_ROOT" 2>/dev/null | tail -1

    echo ""
    echo -e "${BOLD}Memory Usage:${NC}"
    free -h | head -2
}

cmd_help() {
    echo "RecoveryBot Ecosystem Orchestration"
    echo ""
    echo "This script manages all services required by the Unified Dashboard"
    echo "and RecoveryBot Android client backend services."
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start [--parallel]     Start all ecosystem services"
    echo "  stop                   Stop all ecosystem services"
    echo "  restart [--parallel]   Restart all ecosystem services"
    echo "  status                 Show status of all services"
    echo "  health                 Deep health check all services"
    echo "  diagnose               Show diagnostic information for troubleshooting"
    echo "  logs <service>         View logs for a specific service"
    echo "  help                   Show this help message"
    echo ""
    echo "Services Managed:"
    echo "  docker     - Docker engine (system)"
    echo "  ollama     - LLM inference (port 11434)"
    echo "  postgres   - PostgreSQL with pgvector (port 5432)"
    echo "  redis      - Cache and session store (port 6379)"
    echo "  searxng    - Metasearch engine (port 8888)"
    echo "  docling    - Document processor (port 8003)"
    echo "  pdf-tools  - PDF Extraction API (port 8002)"
    echo "  memos      - memOS agentic search (port 8001)"
    echo "  dashboard  - Unified Dashboard UI (port 3100)"
    echo ""
    echo "Individual Service Scripts:"
    echo "  PDF Tools:  $PDF_TOOLS/api_server.sh"
    echo "  memOS:      $MEMOS_SERVER/start_server.sh"
    echo "  Dashboard:  $UNIFIED_DASHBOARD/start.sh"
    echo ""
    echo "Examples:"
    echo "  $0 start              # Start all services in dependency order"
    echo "  $0 status             # Show status of all services"
    echo "  $0 health             # Deep health check"
    echo "  $0 logs memos         # View memOS logs"
    echo "  $0 stop               # Stop all services"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

case "${1:-help}" in
    start)
        shift
        cmd_start "$@"
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        shift
        cmd_restart "$@"
        ;;
    status)
        cmd_status
        ;;
    health)
        cmd_health
        ;;
    diagnose|diag)
        cmd_diagnose
        ;;
    logs)
        shift
        cmd_logs "$@"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo ""
        cmd_help
        exit 1
        ;;
esac
