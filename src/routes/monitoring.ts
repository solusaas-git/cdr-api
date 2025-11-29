import { FastifyInstance } from 'fastify';
import { requestQueue } from '../queue';
import { dbHealthMonitor } from '../db-health';

/**
 * Monitoring routes for health checks and queue statistics
 */
export async function monitoringRoutes(fastify: FastifyInstance) {
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
}

