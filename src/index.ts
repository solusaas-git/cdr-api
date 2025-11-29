import Fastify from 'fastify';
import cors from '@fastify/cors';
import { cdrRoutes } from './routes/cdrs';
import { consumptionRoutes } from './routes/consumption';
import { closePool, query, waitForPostgres } from './db';
import { requestQueue } from './queue';
import { dbHealthMonitor } from './db-health';
import { config, printConfigSummary } from './config';

// Constants from config
const { app, server, security, logging } = config;
const { port: PORT, host: HOST } = server;
const { version: API_VERSION, isProduction: IS_PRODUCTION, environment: NODE_ENV } = app;

// Configure logger based on environment
const loggerConfig = {
  level: logging.level,
  transport: logging.pretty ? {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
};

const fastify = Fastify({
  logger: loggerConfig,
  requestTimeout: server.requestTimeout,
  bodyLimit: server.bodyLimit,
});

// Register CORS
fastify.register(cors, {
  origin: security.allowedOrigins,
  credentials: security.corsCredentials,
});

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  // Log the error
  fastify.log.error(error);
  
  // Determine status code
  const statusCode = error.statusCode || 500;
  
  // Build error response
  const errorResponse: any = {
    success: false,
    status: 'error',
    error: error.message || 'Internal server error',
    timestamp: new Date().toISOString(),
  };
  
  // Add stack trace in development only
  if (!IS_PRODUCTION) {
    errorResponse.stack = error.stack;
  }
  
  // Send error response
  reply.code(statusCode).send(errorResponse);
});

// Register routes
fastify.register(cdrRoutes);
fastify.register(consumptionRoutes);

// Root endpoint
fastify.get('/', async (request, reply) => {
  return {
    service: 'CDR API',
    version: API_VERSION,
    status: 'running',
    environment: NODE_ENV,
  };
});

// Health check endpoint with database connectivity test
fastify.get('/health', async (request, reply) => {
  try {
    console.log('🏥 Health check requested');
    
    // Test database connection with timeout
    const dbTestPromise = query('SELECT 1 as test');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database query timeout after 5s')), 5000)
    );
    
    await Promise.race([dbTestPromise, timeoutPromise]);
    
    console.log('✅ Health check passed');
    
    // Include queue stats and db health in health check
    const queueStats = requestQueue.getStats();
    const dbHealth = dbHealthMonitor.getStatus();
    
    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: API_VERSION,
      queue: queueStats,
      dbHealth: {
        ...dbHealth,
        summary: dbHealthMonitor.getStatusSummary(),
      },
    };
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    const queueStats = requestQueue.getStats();
    const dbHealth = dbHealthMonitor.getStatus();
    
    return reply.code(503).send({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: API_VERSION,
      error: error instanceof Error ? error.message : 'Unknown error',
      // Only include stack trace in development
      ...(IS_PRODUCTION ? {} : { stack: error instanceof Error ? error.stack : undefined }),
      queue: queueStats,
      dbHealth: {
        ...dbHealth,
        summary: dbHealthMonitor.getStatusSummary(),
      },
    });
  }
});

// Database health status endpoint
fastify.get('/db/health', async (request, reply) => {
  const status = dbHealthMonitor.getStatus();
  const summary = dbHealthMonitor.getStatusSummary();
  
  return {
    success: true,
    ...status,
    summary,
    timeSinceDown: dbHealthMonitor.timeSinceDown(),
    timeSinceSuccess: dbHealthMonitor.timeSinceSuccess(),
    timestamp: new Date().toISOString(),
  };
});

// Queue stats endpoint (for monitoring)
fastify.get('/queue/stats', async (request, reply) => {
  const stats = requestQueue.getStats();
  return {
    success: true,
    ...stats,
    timestamp: new Date().toISOString(),
  };
});

// Graceful shutdown
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    return; // Prevent multiple shutdown attempts
  }
  isShuttingDown = true;
  
  console.log(`\n🛑 Received ${signal}, shutting down...`);
  
  // Set a hard timeout - force exit if shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    console.log('⚠️  Force exiting after 1s timeout');
    process.exit(0);
  }, 1000);
  
  try {
    // Stop health monitor
    dbHealthMonitor.stop();
    
    // Close Fastify server first (stops accepting new connections)
    await Promise.race([
      fastify.close(),
      new Promise((resolve) => setTimeout(resolve, 500))
    ]);
    
    // Close database pool
    await closePool();
    
    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    // Print configuration summary
    printConfigSummary();
    
    // Wait for database to be ready before starting server
    await waitForPostgres();
    
    // Start database health monitoring
    dbHealthMonitor.start();
    
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
🚀 CDR API Server is running!
📡 Listening on: http://${HOST}:${PORT}
🔗 Health check: http://${HOST}:${PORT}/health
📊 CDR endpoint: http://${HOST}:${PORT}/cdrs
🏥 DB Health: http://${HOST}:${PORT}/db/health
📊 Queue stats: http://${HOST}:${PORT}/queue/stats
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

