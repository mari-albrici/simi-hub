#!/usr/bin/env bash
set -euo pipefail
# Isolated, named local services; no application credentials are read.
docker network create simi-cycle-e2e >/dev/null
docker run --name simi-cycle-e2e-db --network simi-cycle-e2e -e POSTGRES_PASSWORD=local-only -d postgres:17 >/dev/null
for attempt in {1..30}; do
 if docker exec simi-cycle-e2e-db pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker cp tests/sql/bootstrap.sql simi-cycle-e2e-db:/tmp/bootstrap.sql
docker cp supabase/migrations simi-cycle-e2e-db:/tmp/migrations
docker cp tests/e2e/fixture.sql simi-cycle-e2e-db:/tmp/fixture.sql
docker exec simi-cycle-e2e-db psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/bootstrap.sql
docker exec simi-cycle-e2e-db sh -c 'for f in /tmp/migrations/*.sql; do psql -U postgres -q -v ON_ERROR_STOP=1 -f "$f" || exit 1; done'
docker exec simi-cycle-e2e-db psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/fixture.sql
docker run --name simi-cycle-e2e-rest --network simi-cycle-e2e -p 127.0.0.1:55431:3000 -e PGRST_DB_URI=postgres://postgres:local-only@simi-cycle-e2e-db:5432/postgres -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=simi-local-e2e-only-jwt-secret-32-characters -d postgrest/postgrest:v12.2.3 >/dev/null
