#!/bin/sh
cd "$(dirname "$0")"
# Keep the phone's CPU awake while listening. Without this Android dozes with the screen off, Telegram's
# keep-alive pings stop, and the connection drops every few minutes (missed signals).
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
while true; do
  node --max-old-space-size=256 listener.js
  echo "listener exited at $(date), restarting in 5s"
  sleep 5
done
