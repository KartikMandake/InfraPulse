import { query, closePool } from './connection.js';

async function analyzeDatabase() {
  console.log('[DB Analysis] Inspecting indexes and query execution plans on local PostgreSQL...');

  // 1. Current Indexes
  const idxRes = await query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);

  console.log(`\nExisting Indexes Found (${idxRes.rows.length}):`);
  idxRes.rows.forEach(r => console.log(`  - [${r.tablename}] ${r.indexname}`));

  // 2. Incident Filtering Query Plan
  console.log('\n--- 1. Incidents Filtering (status = \'investigating\') ---');
  const q1 = await query("EXPLAIN ANALYZE SELECT * FROM incidents WHERE status = 'investigating';");
  q1.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));

  // 3. Alert Filtering & Pagination (active alerts sorted by fired_at DESC)
  console.log('\n--- 2. Alerts Filtering & Ordering (status = \'active\') ---');
  const q2 = await query("EXPLAIN ANALYZE SELECT * FROM alerts WHERE status = 'active' ORDER BY fired_at DESC LIMIT 20;");
  q2.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));

  // 4. Notification Queue Claiming (pending/failed with next_retry_at)
  console.log('\n--- 3. Notification Queue Claiming Plan ---');
  const q3 = await query(`
    EXPLAIN ANALYZE
    SELECT id FROM notification_deliveries
    WHERE status IN ('pending', 'failed')
      AND attempt_count < max_attempts
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at ASC
    LIMIT 10;
  `);
  q3.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));

  // 5. Audit Log Pagination
  console.log('\n--- 4. Audit Log Pagination Plan ---');
  const q4 = await query("EXPLAIN ANALYZE SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50;");
  q4.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));

  // 6. Investigation Runs History
  console.log('\n--- 5. Investigation Runs by Incident Plan ---');
  const q5 = await query("EXPLAIN ANALYZE SELECT * FROM investigation_runs WHERE incident_id = 'INC-4921' ORDER BY created_at DESC;");
  q5.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));

  await closePool();
}

analyzeDatabase().catch(err => {
  console.error('[DB Analysis Error]:', err);
  process.exit(1);
});
