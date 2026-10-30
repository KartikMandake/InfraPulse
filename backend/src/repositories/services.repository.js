import { query } from '../db/connection.js';

function mapServiceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    protocol: row.protocol,
    status: row.status,
    latencyP99: Number(row.latency_p99),
    latencyBaseline: Number(row.latency_baseline),
    errorRate: Number(row.error_rate),
    rps: Number(row.rps),
    podCount: Number(row.pod_count),
    region: row.region,
    namespace: row.namespace,
    cpuPercent: Number(row.cpu_percent),
    memoryPercent: Number(row.memory_percent),
    dependencies: row.dependencies || [],
    tags: row.tags || [],
    endpoints: typeof row.endpoints === 'string' ? JSON.parse(row.endpoints) : (row.endpoints || []),
    pods: typeof row.pods === 'string' ? JSON.parse(row.pods) : (row.pods || []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findAllServices(client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM services ORDER BY tier ASC, name ASC;');
  return res.rows.map(mapServiceRow);
}

export async function findServiceById(id, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q('SELECT * FROM services WHERE id = $1;', [id]);
  return mapServiceRow(res.rows[0]);
}

export async function updateServiceRecord(id, updates, client = null) {
  const q = client ? client.query.bind(client) : query;
  const current = await findServiceById(id, client);
  if (!current) return null;

  const merged = { ...current, ...updates };

  const res = await q(
    `UPDATE services SET
      status = $1,
      latency_p99 = $2,
      latency_baseline = $3,
      error_rate = $4,
      rps = $5,
      pod_count = $6,
      cpu_percent = $7,
      memory_percent = $8,
      endpoints = $9,
      pods = $10,
      dependencies = $11,
      updated_at = NOW()
    WHERE id = $12
    RETURNING *;`,
    [
      merged.status,
      merged.latencyP99,
      merged.latencyBaseline,
      merged.errorRate,
      merged.rps,
      merged.podCount,
      merged.cpuPercent,
      merged.memoryPercent,
      JSON.stringify(merged.endpoints),
      JSON.stringify(merged.pods),
      merged.dependencies,
      id
    ]
  );

  return mapServiceRow(res.rows[0]);
}

export async function createServiceRecord(serviceData, client = null) {
  const q = client ? client.query.bind(client) : query;
  const res = await q(
    `INSERT INTO services (
      id, name, tier, protocol, status, latency_p99, latency_baseline,
      error_rate, rps, pod_count, region, namespace, cpu_percent, memory_percent,
      dependencies, tags, endpoints, pods
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      latency_p99 = EXCLUDED.latency_p99,
      error_rate = EXCLUDED.error_rate,
      updated_at = NOW()
    RETURNING *;`,
    [
      serviceData.id,
      serviceData.name,
      serviceData.tier || 0,
      serviceData.protocol || 'HTTP',
      serviceData.status || 'nominal',
      serviceData.latencyP99 || 0,
      serviceData.latencyBaseline || 0,
      serviceData.errorRate || 0,
      serviceData.rps || 0,
      serviceData.podCount || 1,
      serviceData.region || 'us-east-1',
      serviceData.namespace || 'default',
      serviceData.cpuPercent || 0,
      serviceData.memoryPercent || 0,
      serviceData.dependencies || [],
      serviceData.tags || [],
      JSON.stringify(serviceData.endpoints || []),
      JSON.stringify(serviceData.pods || [])
    ]
  );
  return mapServiceRow(res.rows[0]);
}

