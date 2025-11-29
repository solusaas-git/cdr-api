import { Pool, PoolClient } from 'pg';
import { enqueueRequest } from './queue';
import { isDbHealthy } from './db-health';
import { config } from './config';

const { database } = config;

// Create connection pool
// Supports both DATABASE_URL (connection string) and individual parameters
export const pool = new Pool(
  database.url
    ? {
        connectionString: database.url,
        max: database.maxConnections,
        idleTimeoutMillis: database.idleTimeoutMillis,
        connectionTimeoutMillis: database.connectionTimeoutMillis,
      }
    : {
        host: database.host,
        port: database.port,
        database: database.name,
        user: database.user,
        password: database.password,
        max: database.maxConnections,
        idleTimeoutMillis: database.idleTimeoutMillis,
        connectionTimeoutMillis: database.connectionTimeoutMillis,
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

// Wait for PostgreSQL to become ready (important for replicas)
export async function waitForPostgres(
  retries = config.startup.maxRetries,
  delay = config.startup.retryDelayMs
): Promise<void> {
  console.log('⏳ Waiting for PostgreSQL to become ready...');
  
  while (retries > 0) {
    try {
      await pool.query('SELECT NOW()');
      console.log('✅ Database is ready');
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.log(
        `⏳ Database not ready yet (${errorMessage}) — retrying in ${delay}ms... (${retries} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      retries--;
    }
  }
  
  throw new Error('❌ Database failed to become ready after all retries');
}

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
    if (duration > database.slowQueryThreshold) {
      console.warn(`⚠️  SLOW QUERY DETECTED: ${duration}ms`);
    }
    
    return res.rows;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Query failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * Safe query wrapper with intelligent routing
 * 
 * Routes queries based on database health:
 * - If DB is healthy → Execute immediately (fast path)
 * - If DB is unhealthy → Queue the request (slow path, but safe)
 * 
 * This provides automatic protection without requiring changes to route handlers.
 */
export async function safeQuery<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  // Fast path: If database is healthy, execute immediately
  if (isDbHealthy()) {
    return query<T>(text, params);
  }

  // Slow path: Database is unhealthy, queue the request
  console.log('⚠️  Database unhealthy - queuing query');
  return enqueueRequest(() => query<T>(text, params));
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

