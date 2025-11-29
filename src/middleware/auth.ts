import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

const { apiSecret } = config.security;

/**
 * Authentication middleware to validate API secret
 * Checks for Bearer token in Authorization header
 */
export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip auth if no API_SECRET is configured (for development only)
  if (!apiSecret) {
    console.warn('⚠️  WARNING: API_SECRET not configured - API is UNSECURED!');
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader) {
    console.error('❌ Authentication failed: No Authorization header');
    return reply.code(401).send({
      success: false,
      error: 'Unauthorized: Missing Authorization header',
    });
  }

  const token = authHeader.replace('Bearer ', '');

  if (token !== apiSecret) {
    console.error('❌ Authentication failed: Invalid API secret');
    return reply.code(401).send({
      success: false,
      error: 'Unauthorized: Invalid API secret',
    });
  }

  // Authentication successful
  console.log('✅ Request authenticated');
}

