/**
 * Configuration Module
 * 
 * Centralizes all configuration and environment variables
 * with type safety and defaults.
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

/**
 * Application Configuration
 */
export const config = {
  // Application info
  app: {
    name: 'CDR API',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development',
  },

  // Server configuration
  server: {
    port: parseInt(process.env.API_PORT || '3002', 10),
    host: process.env.API_HOST || '0.0.0.0',
    requestTimeout: 600000, // 10 minutes
    bodyLimit: 10485760, // 10MB
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'sippy',
    user: process.env.DB_USER || 'replicator',
    password: process.env.DB_PASSWORD,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    slowQueryThreshold: 5000, // ms
  },

  // Database startup configuration
  startup: {
    maxRetries: 30,
    retryDelayMs: 2000,
  },

  // Queue configuration
  queue: {
    maxSize: parseInt(process.env.QUEUE_MAX_SIZE || '200', 10),
    requestTimeout: parseInt(process.env.QUEUE_REQUEST_TIMEOUT || '30000', 10),
    failureThreshold: parseInt(process.env.QUEUE_FAILURE_THRESHOLD || '5', 10),
    successThreshold: parseInt(process.env.QUEUE_SUCCESS_THRESHOLD || '3', 10),
    circuitResetTimeout: parseInt(process.env.QUEUE_CIRCUIT_RESET_TIMEOUT || '60000', 10),
    maxRequestAge: parseInt(process.env.QUEUE_MAX_REQUEST_AGE || '120000', 10),
  },

  // Health monitor configuration
  healthMonitor: {
    checkInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '2000', 10),
    checkTimeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT || '5000', 10),
  },

  // Security configuration
  security: {
    apiSecret: process.env.API_SECRET,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    corsCredentials: true,
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY !== 'false',
  },

  // CDR query limits
  cdrs: {
    maxLimit: 200000, // Max records per request
    defaultLimit: 500,
    defaultOffset: 0,
  },
};

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Check database configuration
  if (!config.database.url && !config.database.password) {
    errors.push('Missing DATABASE_URL or DB_PASSWORD');
  }

  // Warn about missing API secret in production
  if (config.app.isProduction && !config.security.apiSecret) {
    console.warn('⚠️  WARNING: API_SECRET not set in production!');
  }

  // Validate numeric ranges
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('API_PORT must be between 1 and 65535');
  }

  if (config.queue.maxSize < 1) {
    errors.push('QUEUE_MAX_SIZE must be greater than 0');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * Print configuration summary (safe for logging)
 */
export function printConfigSummary(): void {
  console.log('\n📋 Configuration Summary:');
  console.log(`   App: ${config.app.name} v${config.app.version}`);
  console.log(`   Environment: ${config.app.environment}`);
  console.log(`   Server: ${config.server.host}:${config.server.port}`);
  console.log(`   Database: ${config.database.host}:${config.database.port}/${config.database.name}`);
  console.log(`   Max Connections: ${config.database.maxConnections}`);
  console.log(`   Queue Max Size: ${config.queue.maxSize}`);
  console.log(`   Health Check Interval: ${config.healthMonitor.checkInterval}ms`);
  console.log(`   API Secret: ${config.security.apiSecret ? '✅ Set' : '❌ Not set'}`);
  console.log('');
}

// Validate on import
validateConfig();

