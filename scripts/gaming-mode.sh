#!/bin/bash
#
# Gaming Mode Detection Utility
#
# Detects if the system is in "gaming mode" by checking for:
# - Steam client running
# - Proton/Wine game processes
# - High GPU utilization (>80%)
# - Systemd inhibitor locks (e.g., from games)
#
# Usage:
#   source /home/sparkone/sdd/unified_dashboard/scripts/gaming-mode.sh
#   if is_gaming; then echo "Gaming in progress"; fi
#
# Or as standalone:
#   ./gaming-mode.sh check    # Exit 0 if gaming, 1 if not
#   ./gaming-mode.sh status   # Human-readable status
#   ./gaming-mode.sh wait     # Block until gaming stops
#
# Environment Variables:
#   GAMING_MODE_SKIP=1           - Skip all checks (force proceed)
#   GAMING_MODE_GPU_THRESHOLD=80 - GPU utilization threshold (default: 80%)
#   GAMING_MODE_WAIT_INTERVAL=60 - Seconds between checks when waiting (default: 60)
#

GAMING_MODE_GPU_THRESHOLD="${GAMING_MODE_GPU_THRESHOLD:-80}"
GAMING_MODE_WAIT_INTERVAL="${GAMING_MODE_WAIT_INTERVAL:-60}"

# Colors for output
_GM_RED='\033[0;31m'
_GM_GREEN='\033[0;32m'
_GM_YELLOW='\033[1;33m'
_GM_BLUE='\033[0;34m'
_GM_NC='\033[0m'

# ============================================================================
# Detection Functions
# ============================================================================

# Check if Steam client is running
is_steam_running() {
    pgrep -x "steam" >/dev/null 2>&1
}

# Check for Steam game processes (common patterns)
is_steam_game_running() {
    # Check for reaper (Steam's game process manager)
    pgrep -f "steam.*reaper" >/dev/null 2>&1 && return 0

    # Check for gameoverlayui (Steam overlay, indicates active game)
    pgrep -x "gameoverlayui" >/dev/null 2>&1 && return 0

    # Check for steam_app processes
    pgrep -f "steam_app_" >/dev/null 2>&1 && return 0

    return 1
}

# Check for Proton/Wine game processes
is_proton_game_running() {
    # Proton prefix processes
    pgrep -f "proton" >/dev/null 2>&1 && return 0

    # Wine processes running games (common patterns)
    pgrep -f "wine.*\.exe" >/dev/null 2>&1 && return 0
    pgrep -f "wineserver" >/dev/null 2>&1 && return 0

    # Pressure-Vessel (Steam Linux Runtime container)
    pgrep -f "pressure-vessel" >/dev/null 2>&1 && return 0

    return 1
}

# Check for native Linux games (common launchers/engines)
is_native_game_running() {
    local game_patterns=(
        "Godot"
        "UnrealEngine"
        "Unity"
        "love2d"
        "dosbox"
        "retroarch"
        "dolphin-emu"
        "pcsx2"
        "rpcs3"
        "yuzu"
        "cemu"
    )

    for pattern in "${game_patterns[@]}"; do
        pgrep -fi "$pattern" >/dev/null 2>&1 && return 0
    done

    return 1
}

# Check GPU utilization via nvidia-smi
is_gpu_busy() {
    local gpu_util

    # Try nvidia-smi first
    if command -v nvidia-smi >/dev/null 2>&1; then
        gpu_util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')

        if [[ "$gpu_util" =~ ^[0-9]+$ ]]; then
            if [[ "$gpu_util" -gt "$GAMING_MODE_GPU_THRESHOLD" ]]; then
                return 0
            fi
        fi
    fi

    return 1
}

# Check for systemd inhibitor locks (games often set these)
has_gaming_inhibitor() {
    if command -v systemd-inhibit >/dev/null 2>&1; then
        # Check for idle/sleep inhibitors with gaming-related reasons
        local inhibitors
        inhibitors=$(systemd-inhibit --list 2>/dev/null)

        # Look for Steam or game-related inhibitors
        echo "$inhibitors" | grep -qi "steam\|game\|proton" && return 0
    fi

    return 1
}

# Check for fullscreen applications (X11)
is_fullscreen_app_running() {
    if command -v xdotool >/dev/null 2>&1 && [[ -n "$DISPLAY" ]]; then
        local active_window
        active_window=$(xdotool getactivewindow 2>/dev/null)

        if [[ -n "$active_window" ]]; then
            # Check if window is fullscreen
            local window_state
            window_state=$(xprop -id "$active_window" _NET_WM_STATE 2>/dev/null)
            echo "$window_state" | grep -q "_NET_WM_STATE_FULLSCREEN" && return 0
        fi
    fi

    return 1
}

# ============================================================================
# Main Detection Function
# ============================================================================

# Returns 0 if gaming is detected, 1 otherwise
# Sets GAMING_MODE_REASON if gaming is detected
is_gaming() {
    # Allow override via environment
    if [[ "${GAMING_MODE_SKIP:-0}" == "1" ]]; then
        GAMING_MODE_REASON="skipped (GAMING_MODE_SKIP=1)"
        return 1
    fi

    # Check Steam client
    if is_steam_running; then
        # Steam is running, check if a game is active
        if is_steam_game_running; then
            GAMING_MODE_REASON="Steam game process active"
            return 0
        fi

        if is_proton_game_running; then
            GAMING_MODE_REASON="Proton/Wine game running"
            return 0
        fi

        # Steam is open but no game detected - check GPU as tiebreaker
        if is_gpu_busy; then
            GAMING_MODE_REASON="Steam running + high GPU utilization (>${GAMING_MODE_GPU_THRESHOLD}%)"
            return 0
        fi
    fi

    # Check for Proton/Wine without Steam (standalone Wine games)
    if is_proton_game_running; then
        GAMING_MODE_REASON="Proton/Wine game running"
        return 0
    fi

    # Check for native games
    if is_native_game_running; then
        GAMING_MODE_REASON="Native game/emulator running"
        return 0
    fi

    # Check for gaming inhibitors
    if has_gaming_inhibitor; then
        GAMING_MODE_REASON="Gaming-related systemd inhibitor active"
        return 0
    fi

    # Final GPU check for unlisted games
    if is_gpu_busy; then
        # Only consider high GPU as gaming if something game-like is fullscreen
        if is_fullscreen_app_running; then
            GAMING_MODE_REASON="High GPU utilization + fullscreen app"
            return 0
        fi
    fi

    GAMING_MODE_REASON=""
    return 1
}

# ============================================================================
# Utility Functions
# ============================================================================

# Get detailed gaming status
get_gaming_status() {
    local status="not_gaming"
    local details=""

    if is_steam_running; then
        details="${details}Steam: running\n"
    else
        details="${details}Steam: not running\n"
    fi

    if is_steam_game_running; then
        details="${details}Steam game: active\n"
        status="gaming"
    fi

    if is_proton_game_running; then
        details="${details}Proton/Wine: active\n"
        status="gaming"
    fi

    if is_native_game_running; then
        details="${details}Native game: detected\n"
        status="gaming"
    fi

    local gpu_util="N/A"
    if command -v nvidia-smi >/dev/null 2>&1; then
        gpu_util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
        gpu_util="${gpu_util}%"
    fi
    details="${details}GPU utilization: ${gpu_util}\n"

    if has_gaming_inhibitor; then
        details="${details}Systemd inhibitor: gaming-related\n"
        status="gaming"
    fi

    echo -e "Status: $status"
    echo -e "$details"
}

# Wait for gaming to stop
wait_for_gaming_stop() {
    local max_wait="${1:-0}"  # 0 = infinite
    local start_time=$(date +%s)

    while is_gaming; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ "$max_wait" -gt 0 ]] && [[ "$elapsed" -ge "$max_wait" ]]; then
            echo "Timeout reached after ${elapsed}s, gaming still active"
            return 1
        fi

        echo "[$(date '+%H:%M:%S')] Gaming detected: $GAMING_MODE_REASON"
        echo "  Waiting ${GAMING_MODE_WAIT_INTERVAL}s before next check..."
        sleep "$GAMING_MODE_WAIT_INTERVAL"
    done

    echo "Gaming stopped, proceeding..."
    return 0
}

# Defer a command if gaming is detected
defer_if_gaming() {
    local max_wait="${GAMING_MODE_MAX_WAIT:-0}"

    if is_gaming; then
        echo -e "${_GM_YELLOW}[GAMING MODE]${_GM_NC} Gaming detected: $GAMING_MODE_REASON"
        echo -e "${_GM_YELLOW}[GAMING MODE]${_GM_NC} Deferring heavy operations..."

        if [[ "$max_wait" -gt 0 ]]; then
            echo -e "${_GM_YELLOW}[GAMING MODE]${_GM_NC} Will wait up to ${max_wait}s for gaming to stop"
            if ! wait_for_gaming_stop "$max_wait"; then
                echo -e "${_GM_RED}[GAMING MODE]${_GM_NC} Aborting: gaming still active after timeout"
                return 2
            fi
        else
            echo -e "${_GM_RED}[GAMING MODE]${_GM_NC} Aborting: rerun when gaming is complete"
            return 1
        fi
    fi

    return 0
}

# ============================================================================
# CLI Interface
# ============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-check}" in
        check)
            if is_gaming; then
                exit 0
            else
                exit 1
            fi
            ;;

        status)
            echo -e "${_GM_BLUE}=== Gaming Mode Status ===${_GM_NC}"
            echo ""
            get_gaming_status
            echo ""
            if is_gaming; then
                echo -e "${_GM_YELLOW}Result: GAMING MODE ACTIVE${_GM_NC}"
                echo "Reason: $GAMING_MODE_REASON"
                exit 0
            else
                echo -e "${_GM_GREEN}Result: NOT GAMING${_GM_NC}"
                exit 1
            fi
            ;;

        wait)
            max_wait="${2:-0}"
            echo -e "${_GM_BLUE}=== Waiting for Gaming to Stop ===${_GM_NC}"
            if is_gaming; then
                echo "Gaming detected: $GAMING_MODE_REASON"
                wait_for_gaming_stop "$max_wait"
                exit $?
            else
                echo "Not currently gaming, no need to wait"
                exit 0
            fi
            ;;

        help|--help|-h)
            echo "Gaming Mode Detection Utility"
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  check              Check if gaming (exit 0 if gaming, 1 if not)"
            echo "  status             Show detailed gaming status"
            echo "  wait [max_secs]    Wait for gaming to stop (0 = forever)"
            echo "  help               Show this help"
            echo ""
            echo "Environment Variables:"
            echo "  GAMING_MODE_SKIP=1             Skip all checks"
            echo "  GAMING_MODE_GPU_THRESHOLD=80   GPU % threshold (default: 80)"
            echo "  GAMING_MODE_WAIT_INTERVAL=60   Wait interval in seconds"
            echo "  GAMING_MODE_MAX_WAIT=0         Max wait time (0 = forever)"
            echo ""
            echo "As a library:"
            echo "  source $0"
            echo "  if is_gaming; then echo \"Gaming: \$GAMING_MODE_REASON\"; fi"
            echo ""
            ;;

        *)
            echo "Unknown command: $1"
            echo "Use '$0 help' for usage"
            exit 1
            ;;
    esac
fi
