const path = require('path');
const pgPath = path.resolve(__dirname, '../backend/node_modules/pg');
const { Pool } = require(pgPath);
const crypto = require('crypto');

async function rotateCredentials() {
  const pool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'postgres',
    password: 'postgres',
    database: 'infrapulse_ops_prod',
    ssl: false
  });

  try {
    const { encryptCredentials } = await import('../backend/src/integrations/core/crypto.js');
    const newOtlpKey = process.env.OTEL_INGESTION_KEY || `otlp_${crypto.randomBytes(24).toString('hex')}`;
    const enc = encryptCredentials({ ingestionKey: newOtlpKey });

    const res = await pool.query(`
      UPDATE integration_credentials
      SET encrypted_data = $1, iv = $2, auth_tag = $3, redacted_preview = $4, updated_at = NOW()
      WHERE integration_id IN (SELECT id FROM integrations WHERE provider = 'opentelemetry')
    `, [enc.encryptedData, enc.iv, enc.authTag, JSON.stringify({ ingestionKey: 'otlp_••••••••' })]);

    console.log(`[Security] Successfully rotated OTLP credentials in DB: ${res.rowCount} record(s) updated.`);
  } finally {
    await pool.end();
  }
}

rotateCredentials().catch(err => {
  console.error('[Security] Failed to rotate credentials:', err.message);
  process.exit(1);
});
