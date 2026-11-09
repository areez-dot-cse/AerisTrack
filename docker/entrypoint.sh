#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Waiting for PostgreSQL..."
until pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; do
  sleep 1
done

npm run migrate

# A named volume survives restarts. Seed only an empty database, so routine
# `docker compose up` never overwrites work entered through the application.
if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  has_users="$(psql "$DATABASE_URL" -tAc 'SELECT EXISTS (SELECT 1 FROM users LIMIT 1)')"
  if [ "$has_users" = "f" ]; then
    npm run seed
  else
    echo "Database already has data; skipping demo seed."
  fi
fi

exec "$@"
