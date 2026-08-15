#!/usr/bin/env bash
#
# Prints a large, high-contrast QR code for this machine's Expo dev server, and
# writes it to qr.png as well.
#
# The QR the Expo CLI draws is rendered with half-height block characters. In a
# lot of terminals — small font, low-contrast theme, non-square cells — that
# comes out unscannable. This prints a full-block version at double width, which
# scans reliably, and a PNG for when the terminal still won't cooperate.
#
set -uo pipefail

cd "$(dirname "$0")"

PORT="${1:-8081}"

# Find the LAN address the phone has to reach. Loopback and docker bridges are
# useless here, so they're filtered out.
detect_ip() {
  if command -v ipconfig >/dev/null 2>&1 && ipconfig getifaddr en0 2>/dev/null; then
    return 0
  fi
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show scope global 2>/dev/null \
      | grep -vE ' (docker|br-|veth|lo)' \
      | awk '{print $4}' | cut -d/ -f1 | head -1
    return 0
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

IP="${EXPO_LAN_IP:-$(detect_ip)}"

if [ -z "$IP" ]; then
  echo "Could not work out this machine's LAN address."
  echo "Pass it explicitly:  EXPO_LAN_IP=192.168.1.10 ./qr.sh"
  exit 1
fi

URL="exp://$IP:$PORT"

printf '\n  \033[1;33m%s\033[0m\n\n' "$URL"

# Full blocks at double width: square cells, maximum contrast.
npx --yes qrcode-terminal "$URL" 2>/dev/null \
  | sed -e 's/▀/█/g; s/▄/█/g' \
  | awk '{gsub(/█/,"██"); gsub(/ /,"  "); print "  " $0}'

if npx --yes qrcode -o qr.png "$URL" >/dev/null 2>&1; then
  printf '\n  Also written to \033[1mqr.png\033[0m — open it and scan from there\n'
  printf '  if the terminal QR still will not read.\n\n'
fi

cat <<EOF
  Scan from INSIDE the Expo Go app on Android (the system camera
  will not open it). On iOS use the Camera app.

  Phone and this machine must be on the same Wi-Fi.
  If it still fails, type the URL above into Expo Go by hand.

EOF
