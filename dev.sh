#!/usr/bin/env bash
#
# Starts the API and the web app together, on Linux and macOS.
#
#   ./dev.sh              start both
#   ./dev.sh --setup      also (re)install dependencies before starting
#
# Ctrl-C stops both cleanly. Everything either process prints is echoed here with a
# prefix and written to logs/dev-api.log and logs/dev-web.log. The application's own
# structured log stays where it always was: backend/logs/jobboard-<timestamp>.log.

set -uo pipefail

# Resolve the repo from the script's own location, so the script works from any
# working directory and from a symlink.
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do
  DIR=$(cd -P "$(dirname "$SOURCE")" && pwd)
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE
done
ROOT=$(cd -P "$(dirname "$SOURCE")" && pwd)

BACKEND=$ROOT/backend
FRONTEND=$ROOT/frontend
LOGS=$ROOT/logs
API_PORT=${API_PORT:-8000}
WEB_PORT=${WEB_PORT:-5173}

VENV=$BACKEND/.venv
PY=$VENV/bin/python

SETUP=0
[ "${1:-}" = "--setup" ] && SETUP=1

# --- output -----------------------------------------------------------------

if [ -t 1 ]; then
  C_API=$'\033[36m'; C_WEB=$'\033[35m'; C_RUN=$'\033[32m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
else
  C_API=''; C_WEB=''; C_RUN=''; C_ERR=''; C_OFF=''
fi

say()  { printf '%s[dev]%s %s\n' "$C_RUN" "$C_OFF" "$*"; }
fail() { printf '%s[dev]%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

# --- preflight --------------------------------------------------------------

command -v node >/dev/null || fail "node is not installed. Node 20+ is required."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || say "warning: Node $NODE_MAJOR detected; 20+ is what this is built against."

# bash's own /dev/tcp — no lsof or ss dependency, so this behaves the same everywhere.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3<&- && return 0 || return 1; }

for port_and_name in "$API_PORT:API" "$WEB_PORT:web app"; do
  port=${port_and_name%%:*}
  name=${port_and_name#*:}
  if port_busy "$port"; then
    fail "Port $port is already in use, so the $name cannot start.
      Find it with:  lsof -i :$port
      Or use another port:  API_PORT=8001 WEB_PORT=5174 ./dev.sh"
  fi
done

if [ ! -x "$PY" ] || [ "$SETUP" = 1 ]; then
  HAVE_UV=0
  command -v uv >/dev/null && HAVE_UV=1

  if [ ! -x "$PY" ]; then
    say "No virtualenv at backend/.venv — creating one."
    if [ "$HAVE_UV" = 1 ]; then
      uv venv "$VENV" || fail "Could not create the virtualenv with uv."
    else
      command -v python3 >/dev/null || fail "python3 is not installed. Python 3.11+ is required."
      python3 -m venv "$VENV" || fail "Could not create the virtualenv."
    fi
  fi

  say "Installing backend dependencies…"
  if [ "$HAVE_UV" = 1 ]; then
    # uv, when present, is both faster and the tool the README recommends for setup.
    uv pip install --quiet --python "$PY" -e "$BACKEND[dev]" || fail "Backend dependency install failed."
  else
    # A venv created by `uv venv` has no pip in it at all, which is how this branch
    # first failed. ensurepip puts one there rather than dead-ending the user.
    "$PY" -m pip --version >/dev/null 2>&1 || "$PY" -m ensurepip --upgrade >/dev/null 2>&1 ||
      fail "This virtualenv has no pip and ensurepip could not add one. Install uv, or recreate backend/.venv with: python3 -m venv backend/.venv"
    "$PY" -m pip install --quiet --upgrade pip
    "$PY" -m pip install --quiet -e "$BACKEND[dev]" || fail "Backend dependency install failed."
  fi
fi

if [ ! -d "$FRONTEND/node_modules" ] || [ "$SETUP" = 1 ]; then
  say "Installing frontend dependencies…"
  (cd "$FRONTEND" && npm install) || fail "npm install failed."
fi

if [ ! -f "$BACKEND/.env" ]; then
  say "No backend/.env — copying .env.example. Set JWT_SECRET before deploying anywhere."
  cp "$BACKEND/.env.example" "$BACKEND/.env"
fi

say "Applying database migrations…"
(cd "$BACKEND" && "$PY" -m alembic upgrade head >/dev/null 2>&1) || fail "alembic upgrade head failed. Run it by hand in backend/ to see why."

mkdir -p "$LOGS"

# --- run --------------------------------------------------------------------

api_pid=''
web_pid=''
shutting_down=0

# Job control, so each server below becomes its own process-group leader and the whole
# tree under it can be signalled at once. It also means Ctrl-C reaches this script alone
# rather than the servers directly, which is what makes shutdown deterministic instead of
# dependent on how the terminal delivers the signal.
set -m

# Every child gets SIGTERM, then a moment to close its sockets, then SIGKILL if it is
# still alive. Without the second stage a wedged reloader can hold the port open and the
# next run fails its own preflight.
cleanup() {
  [ "$shutting_down" = 1 ] && return
  shutting_down=1
  printf '\n'
  say "Stopping…"
  for pid in $api_pid $web_pid; do
    # Signal the process *group*, not just the pid. `npm run dev` is a wrapper around
    # `sh -c vite` around node, and uvicorn --reload is a reloader around the real
    # server: TERM to the parent alone leaves the grandchild holding the port. `set -m`
    # below puts each server in its own group, so -$pid reaches the whole tree.
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  done
  for _ in $(seq 1 50); do
    still=0
    for pid in $api_pid $web_pid; do
      kill -0 "$pid" 2>/dev/null && still=1
    done
    [ "$still" = 0 ] && break
    sleep 0.1
  done
  for pid in $api_pid $web_pid; do
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  say "Stopped."
}

# Ctrl-C is a successful end to a dev session, not a failure, and the watch loop below
# must not then report the servers as having "exited" on their own.
on_signal() {
  cleanup
  exit 0
}
trap on_signal INT TERM

# Process substitution keeps $! as the server's own pid rather than the pipeline's, which
# is what makes the shutdown above address the right process.
#
# The reader is a plain `read` loop rather than awk or `tee | awk`, and that is
# deliberate — both of the obvious alternatives silently swallow output here:
#   * `tee file | awk` — tee block-buffers 4KB when its stdout is a pipe, so nothing
#     surfaces until the buffer fills.
#   * a lone awk — mawk, which is /usr/bin/awk on Debian and Ubuntu, does not forward
#     piped input promptly. Measured against this repo's own server: tee saw 5 lines
#     where mawk saw 0.
# `read` takes one byte at a time from the pipe, so a line appears the moment it is
# written, on every platform, with nothing installed.
start() {
  local label=$1 colour=$2 logfile=$3; shift 3
  : >"$logfile"
  "$@" > >(
    while IFS= read -r line; do
      printf '%s[%s]%s %s\n' "$colour" "$label" "$C_OFF" "$line"
      printf '%s\n' "$line" >>"$logfile"
    done
  ) 2>&1 &
}

say "Starting API on http://localhost:$API_PORT  (docs at /docs)"
cd "$BACKEND"
# PYTHONUNBUFFERED matters here: Python block-buffers stdout when it is a pipe rather
# than a terminal, so without it the server's output only surfaces once 8KB has piled
# up — the log looks empty for the first few minutes of a session.
start api "$C_API" "$LOGS/dev-api.log" \
  env PYTHONUNBUFFERED=1 "$PY" -m uvicorn app.main:app --reload --port "$API_PORT"
api_pid=$!

say "Starting web app on http://localhost:$WEB_PORT"
cd "$FRONTEND"
start web "$C_WEB" "$LOGS/dev-web.log" npm run dev -- --port "$WEB_PORT" --strictPort
web_pid=$!

# Job control has done its one job — both servers are now process-group leaders, which is
# fixed at fork time and survives this. Switching it back off stops bash printing its
# "[1]+ Done…" job notices over the shutdown message.
set +m

cd "$ROOT"
say "Both running. Ctrl-C to stop. Wrapper logs in logs/, application log in backend/logs/."

# If either process dies on its own, take the other down too — a half-running stack is
# more confusing than a stopped one.
while :; do
  for pid_and_name in "$api_pid:API" "$web_pid:web app"; do
    [ "$shutting_down" = 1 ] && exit 0
    pid=${pid_and_name%%:*}
    name=${pid_and_name#*:}
    if ! kill -0 "$pid" 2>/dev/null; then
      printf '%s[dev]%s The %s exited. Shutting the other one down.\n' "$C_ERR" "$C_OFF" "$name" >&2
      cleanup
      exit 1
    fi
  done
  sleep 0.5
done
