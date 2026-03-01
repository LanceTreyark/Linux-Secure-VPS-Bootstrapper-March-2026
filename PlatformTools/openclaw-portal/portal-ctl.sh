#!/bin/bash
# ──────────────────────────────────────────────
#  OpenClaw Portal Manager
#  Usage: portal-ctl {start|stop|status|health}
# ──────────────────────────────────────────────

PORTAL_DIR="/opt/openclaw-portal"
PID_FILE="$PORTAL_DIR/.portal.pid"
DISABLED_FILE="$PORTAL_DIR/.disabled"
LOG_FILE="/var/log/openclaw-portal.log"

start_portal() {
  rm -f "$DISABLED_FILE"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Portal is already running (PID: $(cat "$PID_FILE"))"
    return 0
  fi
  cd "$PORTAL_DIR" || exit 1
  nohup node server.mjs >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Portal started (PID: $!)"
  echo "Logs: $LOG_FILE"
}

stop_portal() {
  touch "$DISABLED_FILE"
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      # Wait briefly for graceful shutdown
      for i in 1 2 3 4 5; do
        kill -0 "$PID" 2>/dev/null || break
        sleep 1
      done
      # Force kill if still running
      kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null
      rm -f "$PID_FILE"
      echo "Portal stopped (PID: $PID)"
    else
      rm -f "$PID_FILE"
      echo "Portal was not running (stale PID file removed)"
    fi
  else
    pkill -f "node.*server\.mjs" 2>/dev/null
    echo "Portal stopped"
  fi
  echo "Auto-restart disabled. Use 'portal-start' to re-enable."
}

status_portal() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Portal is RUNNING (PID: $(cat "$PID_FILE"))"
  else
    echo "Portal is NOT RUNNING"
  fi
  if [ -f "$DISABLED_FILE" ]; then
    echo "Auto-restart: DISABLED (manual stop)"
  else
    echo "Auto-restart: ENABLED"
  fi
}

health_check() {
  # Called by cron — silent unless restarting
  [ -f "$DISABLED_FILE" ] && exit 0
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && exit 0
  # Not running and not disabled — restart
  cd "$PORTAL_DIR" || exit 1
  nohup node server.mjs >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "$(date): Portal auto-restarted (PID: $!)" >> "$LOG_FILE"
}

case "$1" in
  start)   start_portal ;;
  stop)    stop_portal ;;
  status)  status_portal ;;
  health)  health_check ;;
  *)
    echo "Usage: portal-ctl {start|stop|status|health}"
    echo ""
    echo "Commands:"
    echo "  start   — Start portal & enable auto-restart"
    echo "  stop    — Stop portal & disable auto-restart"
    echo "  status  — Show portal & auto-restart status"
    echo "  health  — Cron health check (auto-restart if needed)"
    exit 1
    ;;
esac
