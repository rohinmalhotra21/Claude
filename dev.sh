#!/usr/bin/env bash
#
# Runs the API and the Expo dev server together.
#
# The API's output is piped and prefixed, but Expo is left attached to the
# terminal: it only draws the QR code and the interactive key menu when stdout
# is a real TTY. Multiplexing both through a tool like concurrently silently
# hides the QR code, which is the whole point of running this.
#
set -uo pipefail

cd "$(dirname "$0")"

API_PID=""

cleanup() {
  if [ -n "$API_PID" ]; then
    # Kill the whole process group so tsx's watcher goes too.
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

printf '\033[0;32mStarting API...\033[0m\n'
npm run dev --prefix server 2>&1 | sed $'s/^/\033[0;32m[api]\033[0m /' &
API_PID=$!

# Let the API print its startup line before Expo takes over the screen.
sleep 3

printf '\033[0;33mStarting Expo — the QR code appears below.\033[0m\n\n'
npm start --prefix mobile
