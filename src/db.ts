import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create connection pool
// Supports both DATABASE_URL (connection string) and individual parameters
export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sippy',
  user: process.env.DB_USER || 'replicator',
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
      }
);

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL replica');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Don't exit immediately - let graceful shutdown handle it
});

// Helper function to execute queries
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const start = Date.now();
  
  try {
    // Log query start with truncated SQL for debugging
    const truncatedSql = text.replace(/\s+/g, ' ').substring(0, 100);
    console.log(`🔍 Executing query: ${truncatedSql}${text.length > 100 ? '...' : ''}`);
    
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    console.log(`⚡ Query executed in ${duration}ms - returned ${res.rows.length} rows`);
    
    // Warn about slow queries
    if (duration > 5000) {
      console.warn(`⚠️  SLOW QUERY DETECTED: ${duration}ms`);
    }
    
    return res.rows;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Query failed after ${duration}ms:`, error);
    throw error;
  }
}

// Helper function for transactions
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  try {
    // Remove all listeners to prevent interference
    pool.removeAllListeners();
    
    // End the pool with a short timeout
    await Promise.race([
      pool.end(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Pool close timeout')), 2000)
      )
    ]);
    
    console.log('🔌 Database pool closed');
  } catch (err) {
    console.log('⚠️  Force closing database pool:', err);
    // Force destroy all clients
  await pool.end();
  }
}

