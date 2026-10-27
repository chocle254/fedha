#!/bin/sh
cd "$(dirname "$0")"
while true; do
  node --max-old-space-size=256 listener.js
  echo "listener exited at $(date), restarting in 5s"
  sleep 5
done
