#!/bin/bash
#
# Ollama LLM Service Management Script
#
# Usage:
#   ./ollama.sh start           - Start Ollama service
#   ./ollama.sh stop            - Stop Ollama service
#   ./ollama.sh restart         - Restart Ollama service
#   ./ollama.sh status          - Show service status
#   ./ollama.sh models          - List loaded models
#   ./ollama.sh pull <model>    - Pull a new model
#   ./ollama.sh run <model>     - Run interactive chat
#   ./ollama.sh optimize        - Apply optimizations
#   ./ollama.sh logs            - View service logs
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMOS_SERVER="/home/sparkone/sdd/Recovery_Bot/memOS/server"

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

cmd_start() {
    log_header "Starting Ollama"

    if systemctl is-active --quiet ollama; then
        log_warning "Ollama is already running"
        cmd_status
        return 0
    fi

    log_info "Starting Ollama service..."
    sudo systemctl start ollama

    sleep 3

    if systemctl is-active --quiet ollama; then
        log_success "Ollama started successfully"
        cmd_status
    else
        log_error "Failed to start Ollama"
        return 1
    fi
}

cmd_stop() {
    log_header "Stopping Ollama"

    if ! systemctl is-active --quiet ollama; then
        log_warning "Ollama is not running"
        return 0
    fi

    log_info "Stopping Ollama service..."
    sudo systemctl stop ollama

    if ! systemctl is-active --quiet ollama; then
        log_success "Ollama stopped"
    else
        log_error "Failed to stop Ollama"
        return 1
    fi
}

cmd_restart() {
    log_header "Restarting Ollama"

    log_info "Restarting Ollama service..."
    sudo systemctl restart ollama

    sleep 3

    if systemctl is-active --quiet ollama; then
        log_success "Ollama restarted successfully"
        cmd_status
    else
        log_error "Failed to restart Ollama"
        return 1
    fi
}

cmd_status() {
    log_header "Ollama Status"

    echo "Systemd Service:"
    systemctl status ollama --no-pager 2>/dev/null | head -10

    echo ""
    echo "API Status:"
    local version=$(curl -s http://localhost:11434/api/version 2>/dev/null)
    if [ -n "$version" ]; then
        echo "$version" | jq . 2>/dev/null || echo "$version"
        echo ""
        log_success "API responding on port 11434"
    else
        log_error "API not responding"
    fi

    echo ""
    echo "Environment Variables:"
    env | grep OLLAMA | sort || echo "  (none set in current shell)"
}

cmd_models() {
    log_header "Loaded Models"

    local models=$(curl -s http://localhost:11434/api/tags 2>/dev/null)
    if [ -z "$models" ]; then
        log_error "Ollama not responding"
        return 1
    fi

    echo "$models" | jq -r '.models[] | "\(.name)\t\(.size / 1024 / 1024 / 1024 | floor)GB\t\(.details.parameter_size)"' 2>/dev/null | \
        column -t -s $'\t'

    echo ""
    local count=$(echo "$models" | jq -r '.models | length' 2>/dev/null)
    log_info "Total models: $count"
}

cmd_pull() {
    local model=$1
    if [ -z "$model" ]; then
        echo "Usage: $0 pull <model>"
        echo ""
        echo "Examples:"
        echo "  $0 pull qwen3:8b"
        echo "  $0 pull llama3.1:8b"
        echo "  $0 pull codellama:7b"
        return 1
    fi

    log_header "Pulling Model: $model"
    ollama pull "$model"
}

cmd_run() {
    local model=$1
    if [ -z "$model" ]; then
        echo "Usage: $0 run <model>"
        echo ""
        echo "Available models:"
        curl -s http://localhost:11434/api/tags 2>/dev/null | jq -r '.models[].name' 2>/dev/null
        return 1
    fi

    log_info "Starting interactive chat with $model..."
    ollama run "$model"
}

cmd_optimize() {
    log_header "Applying Ollama Optimizations"

    if [ -f "$MEMOS_SERVER/setup_ollama_optimization.sh" ]; then
        log_info "Sourcing optimization script..."
        source "$MEMOS_SERVER/setup_ollama_optimization.sh"
        echo ""
        log_success "Optimizations applied to current shell"
        log_warning "Run 'sudo systemctl restart ollama' to apply to service"
    else
        log_error "Optimization script not found: $MEMOS_SERVER/setup_ollama_optimization.sh"
        return 1
    fi
}

cmd_logs() {
    log_info "Showing Ollama logs (Ctrl+C to exit)..."
    journalctl -u ollama -f
}

cmd_help() {
    echo "Ollama LLM Service Management"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  start              Start Ollama service"
    echo "  stop               Stop Ollama service"
    echo "  restart            Restart Ollama service"
    echo "  status             Show service status"
    echo "  models             List loaded models"
    echo "  pull <model>       Pull a new model"
    echo "  run <model>        Run interactive chat"
    echo "  optimize           Apply performance optimizations"
    echo "  logs               View service logs (follow)"
    echo "  help               Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 start           # Start the service"
    echo "  $0 models          # List all models"
    echo "  $0 pull qwen3:8b   # Download a model"
    echo "  $0 run qwen3:8b    # Interactive chat"
    echo ""
}

case "${1:-help}" in
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    models) cmd_models ;;
    pull) shift; cmd_pull "$@" ;;
    run) shift; cmd_run "$@" ;;
    optimize) cmd_optimize ;;
    logs) cmd_logs ;;
    help|--help|-h) cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
