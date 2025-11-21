import Fastify from 'fastify';
import cors from '@fastify/cors';
import { cdrRoutes } from '../src/routes/cdrs';
import { consumptionRoutes } from '../src/routes/consumption';
import { query } from '../src/db';

// Create Fastify instance for Vercel
const fastify = Fastify({
  logger: {
    level: 'info',
  },
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
    environment: 'vercel',
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
    // Test database connection
    await query('SELECT 1');
    
    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: 'vercel',
    };
  } catch (error) {
    return reply.code(503).send({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      environment: 'vercel',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Vercel serverless handler
export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

