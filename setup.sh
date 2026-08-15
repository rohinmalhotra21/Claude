#!/usr/bin/env bash
#
# One-command setup: database up, schema migrated, demo data seeded, deps
# installed. Run ./setup.sh from the repo root, then `npm run dev`.
#
set -euo pipefail

cd "$(dirname "$0")"

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }

# --- Node ---------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  red "Node is not installed. Install Node 20 or newer, then re-run."
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  red "Node 20+ required (found $(node -v))."
  exit 1
fi
green "Node $(node -v)"

# --- Database -----------------------------------------------------------------
# Prefer Docker so nobody has to install and configure Postgres by hand, but
# accept an existing database if DATABASE_URL is already set.
if [ -n "${DATABASE_URL:-}" ]; then
  yellow "Using the DATABASE_URL already in your environment."
elif docker compose version >/dev/null 2>&1; then
  green "Starting Postgres via Docker..."
  docker compose up -d db

  printf 'Waiting for the database'
  for _ in $(seq 1 40); do
    if docker compose exec -T db pg_isready -U postgres -d fittrack >/dev/null 2>&1; then
      printf '\n'
      green "Database ready."
      break
    fi
    printf '.'
    sleep 1
  done

  export DATABASE_URL="postgres://postgres:postgres@localhost:5432/fittrack"
else
  red "Docker isn't available and DATABASE_URL isn't set."
  echo
  echo "Either install Docker Desktop, or point at your own Postgres:"
  echo "  export DATABASE_URL=postgres://user:pass@localhost:5432/fittrack"
  echo "  ./setup.sh"
  exit 1
fi

# --- Server -------------------------------------------------------------------
green "Installing API dependencies..."
(cd server && npm install --no-fund --no-audit --loglevel=error)

if [ ! -f server/.env ]; then
  green "Writing server/.env..."
  # A random secret beats shipping a known default, even locally.
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  cat > server/.env <<EOF
PORT=4000
DATABASE_URL=$DATABASE_URL
JWT_SECRET=$SECRET
CORS_ORIGINS=*
EOF
fi

green "Running migrations..."
(cd server && npm run migrate)

green "Seeding demo data..."
(cd server && npm run seed)

# --- Mobile -------------------------------------------------------------------
green "Installing app dependencies (this one takes a minute)..."
(cd mobile && npm install --no-fund --no-audit --loglevel=error)

cat <<'EOF'

──────────────────────────────────────────────
  Setup complete.

  Start everything:      npm run dev
  Or run them separately:
    API   cd server && npm run dev
    App   cd mobile && npm start

  Then press "w" for the browser, or scan the QR
  code with Expo Go on your phone.

  Sign in with:
    coach@fittrack.app   (trainer, 2 clients)
    alex@fittrack.app    (client, lean bulk)
    priya@fittrack.app   (client, fat loss)
  Password for all three: password123
──────────────────────────────────────────────
EOF
