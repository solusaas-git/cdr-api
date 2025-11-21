import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { cdrRoutes } from './routes/cdrs';
import { consumptionRoutes } from './routes/consumption';
import { closePool, query } from './db';

dotenv.config();

const PORT = parseInt(process.env.API_PORT || '3001');
const HOST = process.env.API_HOST || 'localhost';
const IS_VERCEL = !!process.env.VERCEL;

// Configure logger based on environment
const loggerConfig = IS_VERCEL
  ? { level: 'info' } // Simple logging for Vercel
  : {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
    };

const fastify = Fastify({
  logger: loggerConfig,
  requestTimeout: 600000, // 10 minutes
  bodyLimit: 10485760, // 10MB
});

// Register CORS
fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
});

// Register routes
fastify.register(cdrRoutes);
fastify.register(consumptionRoutes);

// Root endpoint
fastify.get('/', async (request, reply) => {
  return {
    service: 'CDR API',
    version: '1.0.0',
    status: 'running',
    environment: IS_VERCEL ? 'vercel' : 'local',
    endpoints: {
      cdrs: 'GET /cdrs',
      consumption: 'GET /consumption',
      stats: 'GET /cdrs/stats',
      health: 'GET /health',
    },
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
    
    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: IS_VERCEL ? 'vercel' : 'local',
    };
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    return reply.code(503).send({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      environment: IS_VERCEL ? 'vercel' : 'local',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});

// Vercel serverless handler
export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

// Local development server (only runs when not on Vercel)
if (!IS_VERCEL) {
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
      process.exit(0); // Exit cleanly anyway for tsx
  }
};

  // Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
🚀 CDR API Server is running!
📡 Listening on: http://${HOST}:${PORT}
🔗 Health check: http://${HOST}:${PORT}/health
📊 CDR endpoint: http://${HOST}:${PORT}/cdrs
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
}

