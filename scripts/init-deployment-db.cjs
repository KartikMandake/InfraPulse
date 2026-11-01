const path = require('path');
const pgPath = path.resolve(__dirname, '../backend/node_modules/pg');
const { Pool } = require(pgPath);

async function main() {
  const adminPool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
    ssl: false
  });
  
  try {
    const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', ['infrapulse_ops_prod']);
    if (res.rows.length === 0) {
      await adminPool.query('CREATE DATABASE infrapulse_ops_prod');
      console.log('Created isolated deployment database: infrapulse_ops_prod');
    } else {
      console.log('Database infrapulse_ops_prod already exists.');
    }
  } finally {
    await adminPool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
