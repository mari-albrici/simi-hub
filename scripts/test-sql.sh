#!/usr/bin/env bash
set -euo pipefail
# Uses a disposable PostgreSQL database only. Never consumes application env/credentials.
container="simi-phase0-test-${RANDOM}"
cleanup() { docker rm -f "$container" >/dev/null; }
trap cleanup EXIT
docker run --name "$container" --label simi.phase0-test=true -e POSTGRES_PASSWORD=local-test-only -d postgres:17 >/dev/null
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker cp tests/sql "$container":/tmp/tests >/dev/null
docker cp supabase/migrations "$container":/tmp/migrations >/dev/null
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/bootstrap.sql
docker exec "$container" sh -c 'for file in /tmp/migrations/*.sql; do psql -U postgres -q -v ON_ERROR_STOP=1 -f "$file" || exit 1; done'
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase0.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase1c.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase1d.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase1e.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase1f.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase1fb.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/invoice-hotfix.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase1f2.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase2a.sql
docker exec "$container" psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/tests/phase2a1.sql
# Upgrade test: actual legacy relationships/data, including an orphan, must survive.
docker exec "$container" createdb -U postgres phase0_upgrade
docker exec "$container" psql -U postgres -d phase0_upgrade -q -v ON_ERROR_STOP=1 -f /tmp/tests/bootstrap.sql
docker exec "$container" sh -c 'for file in /tmp/migrations/00[123]_*.sql; do psql -U postgres -d phase0_upgrade -q -v ON_ERROR_STOP=1 -f "$file" || exit 1; done'
docker exec "$container" psql -U postgres -d phase0_upgrade -q -v ON_ERROR_STOP=1 -f /tmp/tests/legacy-fixture.sql
 docker exec "$container" sh -c 'for file in /tmp/migrations/00[456789]_*.sql /tmp/migrations/010_*.sql /tmp/migrations/011_*.sql /tmp/migrations/012_*.sql /tmp/migrations/013_*.sql /tmp/migrations/014_*.sql /tmp/migrations/015_*.sql /tmp/migrations/016_*.sql /tmp/migrations/017_*.sql /tmp/migrations/018_*.sql /tmp/migrations/019_*.sql /tmp/migrations/020_*.sql; do psql -U postgres -d phase0_upgrade -q -v ON_ERROR_STOP=1 -f "$file" || exit 1; done'
docker exec "$container" psql -U postgres -d phase0_upgrade -q -v ON_ERROR_STOP=1 -f /tmp/tests/upgrade-assertions.sql
