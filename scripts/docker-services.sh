#!/bin/bash
#
# Docker Services Management Script
#
# Manages Docker containers for the RecoveryBot ecosystem.
#
# Usage:
#   ./docker-services.sh start [service]    - Start services
#   ./docker-services.sh stop [service]     - Stop services
#   ./docker-services.sh restart [service]  - Restart services
#   ./docker-services.sh status             - Show container status
#   ./docker-services.sh logs <service>     - View container logs
#   ./docker-services.sh shell <service>    - Open shell in container
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() {
    echo ""
    echo -e "${BOLD}${CYAN}=== $1 ===${NC}"
    echo ""
}

# Container groups
declare -A CONTAINER_GROUPS
CONTAINER_GROUPS=(
    ["memos"]="memos-postgres memos-redis memos-docling"
    ["searxng"]="searxng searxng-redis searxng-meilisearch searxng-qdrant searxng-tor"
    ["database"]="memos-postgres memos-redis searxng-redis searxng-meilisearch searxng-qdrant"
    ["all"]="memos-postgres memos-redis memos-docling searxng searxng-redis searxng-meilisearch searxng-qdrant searxng-tor"
)

# Container to port mapping
declare -A CONTAINER_PORTS
CONTAINER_PORTS=(
    ["memos-postgres"]="5432"
    ["memos-redis"]="6379"
    ["memos-docling"]="8003"
    ["searxng"]="8888"
    ["searxng-redis"]="(internal)"
    ["searxng-meilisearch"]="7700"
    ["searxng-qdrant"]="6333"
    ["searxng-tor"]="(internal)"
)

get_containers() {
    local group=$1
    if [ -n "${CONTAINER_GROUPS[$group]}" ]; then
        echo "${CONTAINER_GROUPS[$group]}"
    else
        echo "$group"
    fi
}

container_exists() {
    docker ps -a --format '{{.Names}}' | grep -q "^$1$"
}

container_running() {
    docker ps --format '{{.Names}}' | grep -q "^$1$"
}

cmd_start() {
    local target=${1:-all}
    local containers=$(get_containers "$target")

    log_header "Starting Containers: $target"

    for container in $containers; do
        if ! container_exists "$container"; then
            log_warning "$container does not exist"
            continue
        fi

        if container_running "$container"; then
            log_success "$container already running"
        else
            log_info "Starting $container..."
            docker start "$container" >/dev/null 2>&1
            if container_running "$container"; then
                log_success "$container started"
            else
                log_error "$container failed to start"
            fi
        fi
    done
}

cmd_stop() {
    local target=${1:-all}
    local containers=$(get_containers "$target")

    log_header "Stopping Containers: $target"

    for container in $containers; do
        if ! container_running "$container"; then
            log_warning "$container not running"
            continue
        fi

        log_info "Stopping $container..."
        docker stop "$container" >/dev/null 2>&1
        if ! container_running "$container"; then
            log_success "$container stopped"
        else
            log_error "$container failed to stop"
        fi
    done
}

cmd_restart() {
    local target=${1:-all}
    local containers=$(get_containers "$target")

    log_header "Restarting Containers: $target"

    for container in $containers; do
        if ! container_exists "$container"; then
            log_warning "$container does not exist"
            continue
        fi

        log_info "Restarting $container..."
        docker restart "$container" >/dev/null 2>&1
        if container_running "$container"; then
            log_success "$container restarted"
        else
            log_error "$container failed to restart"
        fi
    done
}

cmd_status() {
    log_header "Docker Container Status"

    echo "RecoveryBot Ecosystem Containers:"
    echo ""
    printf "%-20s %-12s %-8s %s\n" "CONTAINER" "STATUS" "PORT" "HEALTH"
    printf "%-20s %-12s %-8s %s\n" "─────────────────" "────────────" "────────" "─────────"

    for container in ${CONTAINER_GROUPS["all"]}; do
        local port="${CONTAINER_PORTS[$container]:-"-"}"
        local status health

        if container_running "$container"; then
            status="${GREEN}running${NC}"
            health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "-")
            if [ "$health" = "healthy" ]; then
                health="${GREEN}$health${NC}"
            elif [ "$health" = "unhealthy" ]; then
                health="${RED}$health${NC}"
            fi
        elif container_exists "$container"; then
            status="${YELLOW}stopped${NC}"
            health="-"
        else
            status="${RED}missing${NC}"
            health="-"
        fi

        printf "%-20s $status %-8s $health\n" "$container" "$port"
    done

    echo ""
    echo "Other Running Containers:"
    docker ps --format "  {{.Names}}: {{.Status}}" | grep -v -E "(memos-|searxng)" || echo "  (none)"
}

cmd_logs() {
    local container=$1
    local lines=${2:-100}

    if [ -z "$container" ]; then
        echo "Usage: $0 logs <container> [lines]"
        echo ""
        echo "Containers:"
        for c in ${CONTAINER_GROUPS["all"]}; do
            echo "  $c"
        done
        return 1
    fi

    if ! container_exists "$container"; then
        log_error "Container $container does not exist"
        return 1
    fi

    log_info "Showing last $lines lines of $container logs (Ctrl+C to exit)..."
    docker logs --tail "$lines" -f "$container"
}

cmd_shell() {
    local container=$1
    local shell=${2:-/bin/bash}

    if [ -z "$container" ]; then
        echo "Usage: $0 shell <container> [shell]"
        echo ""
        echo "Containers:"
        for c in ${CONTAINER_GROUPS["all"]}; do
            echo "  $c"
        done
        return 1
    fi

    if ! container_running "$container"; then
        log_error "Container $container is not running"
        return 1
    fi

    log_info "Opening shell in $container..."
    docker exec -it "$container" "$shell" || docker exec -it "$container" /bin/sh
}

cmd_help() {
    echo "Docker Services Management"
    echo ""
    echo "Usage: $0 <command> [target]"
    echo ""
    echo "Commands:"
    echo "  start [target]       Start containers"
    echo "  stop [target]        Stop containers"
    echo "  restart [target]     Restart containers"
    echo "  status               Show all container status"
    echo "  logs <container>     View container logs"
    echo "  shell <container>    Open shell in container"
    echo "  help                 Show this help"
    echo ""
    echo "Targets:"
    echo "  all        All ecosystem containers (default)"
    echo "  memos      memos-postgres, memos-redis, memos-docling"
    echo "  searxng    searxng + support containers"
    echo "  database   All database/cache containers"
    echo "  <name>     Specific container by name"
    echo ""
    echo "Containers:"
    echo "  memos-postgres     PostgreSQL with pgvector (5432)"
    echo "  memos-redis        Redis cache (6379)"
    echo "  memos-docling      Document processor (8003)"
    echo "  searxng            Metasearch engine (8888)"
    echo "  searxng-redis      SearXNG cache (internal)"
    echo "  searxng-meilisearch Search index (7700)"
    echo "  searxng-qdrant     Vector store (6333)"
    echo "  searxng-tor        Tor proxy (internal)"
    echo ""
    echo "Examples:"
    echo "  $0 start              # Start all containers"
    echo "  $0 start memos        # Start memOS containers only"
    echo "  $0 logs memos-postgres # View PostgreSQL logs"
    echo "  $0 shell searxng      # Shell into SearXNG"
    echo ""
}

case "${1:-help}" in
    start) shift; cmd_start "$@" ;;
    stop) shift; cmd_stop "$@" ;;
    restart) shift; cmd_restart "$@" ;;
    status) cmd_status ;;
    logs) shift; cmd_logs "$@" ;;
    shell) shift; cmd_shell "$@" ;;
    help|--help|-h) cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
