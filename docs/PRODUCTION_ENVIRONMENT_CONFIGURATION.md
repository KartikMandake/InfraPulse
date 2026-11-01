# Production environment configuration

Prepared 2026-11-01. **No `.env`, `.env.example` or staging environment template was edited.** Their historical defaults are not production approval. The [Phase 24 report](PHASE_24_DEPLOYMENT_PREPARATION_REPORT.md) and [runbook](PRODUCTION_DEPLOYMENT_RUNBOOK.md) define the closed release gate.

## Environment separation and startup

| Environment | Settings | Intended configuration |
|---|---|---|
| Development/demo | `NODE_ENV=development`, `APP_ENV=development` | Existing root/base Compose and local Kustomize base. Retains local HTTP, development seed/migration behavior and optional telemetry profiles. Keep off public networks. |
| Automated tests | `NODE_ENV=test`, `APP_ENV=test` | Disposable selected PostgreSQL databases only. Do not run repository test/reset/DR scripts against an existing database. |
| Staging | `NODE_ENV=production`, `APP_ENV=staging` | Same strict application validation as production; separate hosts, credentials, data volume, project identity, domain and certificate. |
| Production | `NODE_ENV=production`, `APP_ENV=production` | Separate `deploy/production/compose.yml`, reviewed external variables/secrets and explicit persistent volume. No automatic migrations/seeds. |

Use `npm start --prefix backend` / `npm run start:worker --prefix backend`, which enter the guarded JavaScript entrypoint. Docker uses the same entrypoint. Configuration failure exits nonzero before opening a listener; production boot errors are structured without a stack. Direct developer invocation of `src/server.js` still validates settings before database startup. No TypeScript or frontend UI changes were introduced.

```text
node scripts/validate-production-config.mjs
node scripts/validate-production-compose.mjs --env-file /etc/infrapulse/runtime.conf
```

These are configuration checks, not deployment approval. The first reads the **currently supplied application environment**, including secret files; the second resolves the external Compose variable file and checks images/network/flags/volume identity without starting resources. They do not prove database role permissions, container secret readability, image availability, DNS, TLS termination or recovery. Do not print resolved Compose configuration or process environments in shared logs. `--fixture` uses temporary synthetic files/digests, performs static validation only and is suitable for CI.

## Required application settings

| Variable | Production rule / purpose |
|---|---|
| `NODE_ENV`, `APP_ENV` | Must describe production or staging consistently. Production-like execution with a development runtime is rejected. |
| `PORT`, `BIND_HOST` | Port integer 1–65535; default 5000. Explicit listener host defaults to `0.0.0.0` for containers; native isolated tests use loopback. Never publish the API container port. |
| `FRONTEND_URL`, `CORS_ORIGIN` | Exact HTTPS origins; comma-separated extra CORS origins permitted. No wildcard/path/userinfo or implicit development localhost origins. Keep origins minimal and reviewed. `APP_BASE_URL` should be the same approved HTTPS application URL. |
| `COOKIE_SECURE` | Must be `true`. Session cookies retain HttpOnly and SameSite=Lax. Application responses also return session tokens; assess browser token storage/XSS separately. |
| `TRUST_PROXY` | Must explicitly be `1` for the reviewed private frontend-to-API boundary. Host edge overwrites forwarded headers; private frontend preserves them. Different load-balancer/CDN/Kubernetes chains need a new validated trust design. |
| `PGHOST`, `PGDATABASE`, `PGUSER` | All explicit. Runtime login differs from migration/backup admin. Current pre-tenant authentication role incompatibility P24-01 must be resolved before this design can run with least privilege. |
| `PGPORT` | Integer 1–65535; production default 5432. Development retains 5434. |
| `PGPASSWORD` or `PGPASSWORD_FILE` | A non-default secret of at least 16 characters. Prefer an external readable file; never both a nonempty value and file. |
| `DATABASE_URL` | Rejected in production/staging. Separate PG settings prevent URL TLS parameters from silently overriding verified TLS/pool settings. Existing development/test URL support remains. |
| `PGSSLMODE` | `verify-full` for remote PostgreSQL; `disable` allowed only for Unix socket/localhost/loopback. No `prefer`, insecure remote transport or disabled certificate verification. |
| `PGSSLROOTCERT_FILE` | PEM CA certificate/bundle for remote verified TLS. File is parsed as a CA and passed to `pg` with `rejectUnauthorized: true`; actual remote handshake/rotation remains untested. |
| `PGMAX` | Default production/staging 6, allowed 1–100. Applied with URL and ordinary development connection settings too. Budget across all processes/replicas. |
| `PG_IDLE_TIMEOUT_MS` | Nonnegative integer, default 10000; connection-acquisition timeout is 5000 ms. |
| `INTEGRATION_ENCRYPTION_KEY` or `_FILE` | Non-default key of at least 32 characters with basic diversity checks. Generate at least 32 random bytes using an approved secret system; length/diversity checks alone cannot establish entropy. Preserve the existing encryption key/version needed for encrypted integration records. |
| `AUTO_MIGRATE`, `AUTO_SEED` | Both `false`; production migration is a separate guarded operator step. Never seed demo accounts into production. |
| `NOTIFICATION_WORKER_ENABLED` | `false` in API when the standalone worker is used. The standalone worker starts its own notification polling loop. It is **not** a lifecycle schedule consumer. |
| `WORKER_HEALTH_FILE` | Required by the Compose worker probe, `/tmp/infrapulse-worker-health.json`. Must be writable by UID 1000 on its private tmpfs. |
| `WORKER_HEALTH_MAX_AGE_MS` | Probe age threshold, default 120000. Failed queue polling writes unhealthy status; missing/stale/failed state returns nonzero. This does not prove actual message delivery. |
| `SHUTDOWN_TIMEOUT_MS` | 1000–120000; default 25000. Compose stop grace is 30 s for app/worker, 60 s for PostgreSQL. Active HTTP requests and the current notification batch drain before pool closure. Timeout exits nonzero. Abrupt provider-operation recovery remains blocked by N11. |
| `AWS_REGION`, `AWS_ALLOWED_REGIONS` | Exactly `ap-south-1`. No account keys belong in frontend or images. Workload identity/read-only IAM/metadata networking need a separate rehearsal. |
| Execution flags | `AWS_LIFECYCLE_MUTATIONS_ENABLED`, `DOCKER_LIFECYCLE_ENABLED`, `KUBERNETES_LIFECYCLE_ENABLED`, `REMEDIATION_EXECUTION_ENABLED`, `REMEDIATION_PRODUCTION_ENABLED` must all remain `false`; production startup rejects enabled flags while release blockers remain. |
| `DEBUG_SQL` | Must not be `true`; production query failures log codes without statements/parameters. |

Application secret-file loading is implemented for the DB password, integration encryption key and CA bundle. It strips one final newline and fails on unreadable files or conflicting nonempty value/file settings, without logging values/paths. Other provider credentials retain existing environment/integration configuration paths; `_FILE` is **not** a universal feature. Do not silently invent unsupported variables.

Optional telemetry, SMTP/Slack and AI provider settings remain in the existing configuration. Their production endpoints, credentials, outbound policy, mock/live labeling, delivery and costs need explicit validation. The core production draft has no notification provider and no optional telemetry stack. A healthy empty notification queue is not operational alerting readiness. Do not place provider/API secrets in any `VITE_*` setting: frontend build variables are public browser assets. Existing frontend API calls use the same-origin `/api` path.

## Compose input file and secrets

Prepare an **external non-secret variable file**, not a repository `.env` replacement. Required names:

```text
PUBLIC_ORIGIN=https://app.example.invalid
BACKEND_IMAGE=registry.example.invalid/infrapulse-backend@sha256:<reviewed-64-hex-digest>
FRONTEND_IMAGE=registry.example.invalid/infrapulse-frontend@sha256:<reviewed-64-hex-digest>
POSTGRES_IMAGE=postgres@sha256:<reviewed-postgresql-16-digest>
POSTGRES_DB=infrapulse
POSTGRES_USER=infrapulse_application
POSTGRES_ADMIN_USER=infrapulse_migration_admin
PGDATA_VOLUME=<explicit-existing-volume-name>
APP_DB_PASSWORD_FILE=/etc/infrapulse/secrets/application-password
ADMIN_DB_PASSWORD_FILE=/etc/infrapulse/secrets/administrator-password
INTEGRATION_KEY_FILE=/etc/infrapulse/secrets/integration-key
```

The example is deliberately non-deployable. The production Compose preflight rejects synthetic zero digests; it does not resolve registry digests or certify their provenance. Compose itself is not an admission controller: run both preflights and the release checklist before a future startup. Never expose secret file contents with `cat`, `echo`, `docker inspect`, debug environments or `docker compose config` output.

Local Compose secrets are file mounts, not an encrypted secret store. Provision with least host permissions outside the repository and verify effective container readability: application key/password readable by UID 1000, administrator secret readable only by the approved DB entrypoint/administrator. Host root-owned 0400 files may be unreadable by the Node container; Compose file-secret UID/mode settings cannot be assumed to fix host bind-mount permissions. Keep separate encrypted escrow of encryption keys and backup credentials. Never replace an integration encryption key without a coordinated re-encryption/recovery procedure.

PostgreSQL initialization uses SCRAM for new local/host HBA entries and disables TCP. Existing volumes do not rerun initialization: inspect their actual HBA and password configuration. No runtime role provisioning or RLS bypass is supplied; **P24-01 is a release blocker**. Do not reuse the admin identity to get around it.

## Logs, errors and network assumptions

Request correlation IDs accept only 1–96 ASCII alphanumeric/underscore/hyphen characters; otherwise a fresh random ID is generated. Request logs omit query strings. Logger message/metadata redaction now covers ingestion/access keys, bearer/DB-URL credentials and deeply nested content. Production 5xx/unclassified database errors return generic messages and correlation IDs, with details removed. This protects the central logger/error path; it is not a proof that every legacy console/provider/audit path is safe. **N15 audit redaction and N19 audit mutability remain open.**

Production API middleware sets no-store/security headers and requires trusted HTTPS except live/ready probes. The frontend CSP retains required Google font origins and inline styles used by the existing UI. Query-free Nginx access formats are supplied; actual Nginx error logs, CSP/browser behavior and TLS are **not runtime verified** while Docker is unavailable. The authentication limiter covers login/registration per IP and per process, 10 attempts/minute with bounded state. Multi-replica/global rate limiting and brute-force response remain deployment work; do not claim a distributed rate limiter.

## Historical configuration compatibility

- `docker-compose.yml` still includes the base development Compose stack. Its optional telemetry profiles and storage remain available; dev mode is now explicit. It is not the production entrypoint.
- Legacy staging Compose parses but its default HTTP origins and missing DB TLS/CA setup deliberately fail strict startup. Supply a reviewed isolated overlay or adapt the production draft to a separate staging project/data volume after gates close. Do not change it to development mode to bypass staging checks.
- Local Kustomize base is explicitly development/demo. Staging overlay is strict production runtime with automatic migrations/seeding disabled and remote TLS required. Existing PostgreSQL manifests do not configure that TLS/CA path; they are **BLOCKED for staging/production runtime**. Both overlays render successfully; no cluster exists locally and no manifests were applied.
- Legacy Kubernetes policies allow overly broad backend ingress through `namespaceSelector: {}`, lack complete egress/default-deny coverage and use floating image tags/read-write roots. This phase does not certify or duplicate them as a production stack.
