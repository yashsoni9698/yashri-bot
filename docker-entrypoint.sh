#!/bin/sh
set -e

# First boot with an empty volume: seed bundled starter data
if [ ! -f /app/data/settings/config.json ] && [ -d /app/seed-data ]; then
  echo "Seeding /app/data from image…"
  cp -a /app/seed-data/. /app/data/
fi

mkdir -p \
  /app/data/tasks \
  /app/data/payments \
  /app/data/clients \
  /app/data/memory \
  /app/data/calendar \
  /app/data/settings \
  /app/data/chat \
  /app/data/uploads \
  /app/data/instagram \
  /app/data/notifications

exec node server.js
