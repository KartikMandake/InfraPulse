# InfraPulse — Environment Configuration Guide

**Phase 20 Release Engineering Deliverable**  
**Document Version**: 2.4.0  

---

## 1. Configuration Matrix by Tier

| Environment Variable | Development | Staging | Production | Description |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `staging` | `production` | Node execution environment |
| `PORT` | `5000` | `5000` | `5000` | Backend API port |
| `PGHOST` | `localhost` | `staging-db.internal` | `prod-db.internal` | PostgreSQL host |
| `PGPORT` | `5434` | `5432` | `5432` | PostgreSQL port |
| `PGDATABASE` | `infrapulse` | `infrapulse_staging` | `infrapulse` | Database name |
| `PGUSER` | `postgres` | `infrapulse_app` | `infrapulse_app` | Application DB user |
| `PGPASSWORD` | `postgres` | `<STAGING_PWD>` | `<STRONG_SECRET_PWD>` | DB user password |
| `INTEGRATION_ENCRYPTION_KEY` | `dev-key-32b-must-be-secure-!` | `<32_CHAR_HEX>` | `<32_CHAR_HEX>` | Master AES-256-GCM key |
| `FRONTEND_URL` | `http://localhost:5173` | `https://staging.infrapulse.io` | `https://infrapulse.io` | Web UI root URL |
| `NOTIFICATION_WORKER_ENABLED`| `true` | `false` | `false` | Dedicated worker runs in prod |
| `NOTIFICATION_MOCK_MODE` | `true` | `true` | `false` | Mocks external Slack/SMTP |
| `SLACK_WEBHOOK_URL` | `` | `https://hooks.slack.com/...` | `https://hooks.slack.com/...` | Incident notification URL |
| `AI_PROVIDER` | `mock` | `mock` | `gemini` / `openai` / `mock` | Investigation Assistant LLM |
| `PROMETHEUS_URL` | `http://localhost:9090` | `http://prometheus:9090` | `http://prometheus:9090` | Prometheus endpoint |
| `OTEL_COLLECTOR_URL` | `http://localhost:4318` | `http://otel-col:4318` | `http://otel-col:4318` | OTLP HTTP receiver |

---

## 2. Secrets Management & Rotation Policy

1. **Master Encryption Key (`INTEGRATION_ENCRYPTION_KEY`)**:
   - Must be exactly 32 bytes (256 bits).
   - In Kubernetes, inject via Secret as an environment variable or volume mount.
   - Never commit `.env`, `.env.production`, or cleartext credentials to source control.
2. **Credential Rotation**:
   - Master key rotation uses version tags (`key_version` in `integration_credentials`).
   - Webhook secrets can be rotated per integration via the `/integrations` UI without server downtime.

