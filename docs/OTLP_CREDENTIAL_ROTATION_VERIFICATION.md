# InfraPulse — OTLP Credential Rotation & Encryption Verification Report

## 1. Executive Summary

This security audit independently verifies the credential rotation and authenticated encryption mechanisms for OpenTelemetry (OTLP) telemetry ingestion in InfraPulse.

All tests were performed against the live backend daemon on port `5001` and PostgreSQL database `infrapulse_ops_prod` on port `5434`.

---

## 2. Cryptographic Architecture

### 2.1 Encryption at Rest (AES-256-GCM)
Ingestion credentials for all third-party integrations (including OpenTelemetry, GitHub webhooks, and AWS cloud providers) are encrypted at rest in the PostgreSQL table `integration_credentials`:

```
 +-----------------------------------------------------------------------------+
 |                         INGESTION SECURITY PIPELINE                         |
 |                                                                             |
 |  Plaintext Credential       AES-256-GCM Encryption       PostgreSQL Table   |
 |  {"ingestionKey": "..."} -> [KeyDerivation: SHA-256] -> [integration_      |
 |                             [IV: 96-bit Random]         credentials]        |
 |                             [AuthTag: 128-bit MAC]      - encrypted_data    |
 |                                                         - iv                |
 |                                                         - auth_tag          |
 |                                                         - redacted_preview  |
 +-----------------------------------------------------------------------------+
```

1. **Algorithm**: `aes-256-gcm` (Authenticated Encryption with Associated Data).
2. **Master Key Derivation**:
   $$K_{\text{derived}} = \text{SHA-256}(K_{\text{INTEGRATION\_ENCRYPTION\_KEY}})$$
   Ensures a strict 256-bit cryptographic key regardless of environment passphrase length.
3. **Initialization Vector (IV)**: 12-byte (96-bit) cryptographically random bytes generated via `crypto.randomBytes(12)` per rotation.
4. **Authentication Tag (MAC)**: 16-byte (128-bit) GCM tag verifying both ciphertext confidentiality and authenticity. Any tampering immediately throws an unhandled state rejection.
5. **Redacted Previews**: Database storage of credential previews strictly replaces sensitive substrings with safe prefixes or masks (`{"ingestionKey": "otlp_••••••••"}`).

---

## 3. Independent Security Verification Results

The verification script [`scripts/verify-otlp-rotation.cjs`](file:///d:/Projects/InfraPulse/scripts/verify-otlp-rotation.cjs) executed the following steps:

### 3.1 Database Ciphertext Inspection
```text
SELECT i.id, i.provider, i.enabled, c.encrypted_data, c.iv, c.auth_tag, c.redacted_preview
FROM integrations i
JOIN integration_credentials c ON c.integration_id = i.id
WHERE i.provider = 'opentelemetry';
```
- **Algorithm**: `AES-256-GCM`
- **Ciphertext Length**: 144 characters (hex-encoded)
- **IV Length**: 24 characters (96 bits)
- **Auth Tag Length**: 32 characters (128 bits)
- **Stored Redacted Preview**: `{"ingestionKey":"otlp_••••••••"}`
- **Decryption Symmetry**: Confirmed with server master encryption key.

### 3.2 Old Revoked Credential Rejection
- **Input Key**: `infrapulse-otlp-collector-key-2026`
- **Target Endpoint**: `POST /api/integrations/otlp/v1/metrics`
- **HTTP Status Code**: `401 Unauthorized`
- **Response Message**: `"Invalid, disabled or ambiguous OTLP ingestion credential."`
- **Result**: **PASS (Correctly Rejected)**

### 3.3 Bogus / Tampered Credential Rejection
- **Input Key**: `otlp_unauthorized_token_test_12345`
- **Target Endpoint**: `POST /api/integrations/otlp/v1/metrics`
- **HTTP Status Code**: `401 Unauthorized`
- **Response Message**: `"Invalid, disabled or ambiguous OTLP ingestion credential."`
- **Result**: **PASS (Correctly Rejected)**

### 3.4 Newly Rotated Active Credential Acceptance
- **Input Key**: Newly generated cryptographic token (`otlp_••••••••`)
- **Target Endpoint**: `POST /api/integrations/otlp/v1/metrics`
- **HTTP Status Code**: `200 OK`
- **Response Body**:
  ```json
  {
    "success": true,
    "ingestedCount": 0,
    "duplicateCount": 0,
    "data": {
      "tenantId": "default_tenant",
      "environment": "staging",
      "provider": "opentelemetry",
      "telemetryType": "metric",
      "processedCount": 0,
      "rejectedCount": 0,
      "duplicateCount": 0
    }
  }
  ```
- **Result**: **PASS (Correctly Accepted)**

---

## 4. Secret Exposure Audit

1. **Source Code & Scripts Scan**:
   - Scanned all `.js`, `.cjs`, and `.json` files for plaintext collector secrets.
   - Zero hardcoded production tokens discovered in application code.
2. **Log & Audit Inspection**:
   - Verified that `logger.js` and `crypto.js` strip sensitive keys (`['secret', 'token', 'key', 'password']`) from debug payloads.
3. **Git History Hygiene**:
   - No plaintext credentials committed to branch `kartik`.
