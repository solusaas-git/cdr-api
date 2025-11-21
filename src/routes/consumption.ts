import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';
import { authenticateRequest } from '../middleware/auth';

interface ConsumptionQuerystring {
  i_account?: string;
  start_date?: string;
  end_date?: string;
}

interface ConsumptionRecord {
  cost: number;
  duration: number;
  result: number;
  connect_time: Date | string;
}

export async function consumptionRoutes(fastify: FastifyInstance) {
  // GET /consumption - Fetch minimal CDR data for consumption calculation
  // Only returns: cost, duration, result, connect_time
  fastify.get<{ Querystring: ConsumptionQuerystring }>(
    '/consumption',
    {
      preHandler: authenticateRequest,
    },
    async (request: FastifyRequest<{ Querystring: ConsumptionQuerystring }>, reply: FastifyReply) => {
      const startTime = Date.now();

      try {
        const {
          i_account,
          start_date,
          end_date,
        } = request.query;

        if (!i_account) {
          return reply.code(400).send({
            success: false,
            error: 'i_account parameter is required',
          });
        }

        const accountId = parseInt(i_account);

        // Build optimized SQL query with PostgreSQL aggregation (much faster!)
        let sql = `
          SELECT 
            COUNT(*) as total_calls,
            COALESCE(SUM(cdrs.cost), 0) as total_cost,
            COALESCE(SUM(cdrs.duration), 0) as total_duration,
            COALESCE(SUM(CASE 
              WHEN cdrs.result IN (0, 200, 202) THEN 1 
              ELSE 0 
            END), 0) as successful_calls,
            COALESCE(SUM(CASE 
              WHEN cdrs.result NOT IN (0, 200, 202) THEN 1 
              ELSE 0 
            END), 0) as failed_calls,
            COALESCE(SUM(CASE 
              WHEN cdrs.result IN (0, 200, 202) THEN cdrs.duration 
              ELSE 0 
            END), 0) as successful_duration
          FROM cdrs
          WHERE i_account = $1
        `;

        const params: any[] = [accountId];
        let paramIndex = 2;

        // Add date filters
        if (start_date) {
          sql += ` AND connect_time >= $${paramIndex}`;
          params.push(start_date);
          paramIndex++;
        }

        if (end_date) {
          sql += ` AND connect_time <= $${paramIndex}`;
          params.push(end_date);
          paramIndex++;
        }

        console.log(`📊 Fetching consumption data for account ${accountId}`);
        console.log(`📅 Date range: ${start_date || 'all'} to ${end_date || 'all'}`);

        // Execute aggregation query
        const queryStart = Date.now();
        const result = await query<any>(sql, params);
        const queryTime = Date.now() - queryStart;

        const row = result[0];
        const totalCalls = parseInt(row.total_calls) || 0;
        const totalCost = parseFloat(row.total_cost) || 0;
        const totalDuration = parseFloat(row.total_duration) || 0;
        const successfulCalls = parseInt(row.successful_calls) || 0;
        const failedCalls = parseInt(row.failed_calls) || 0;
        const successfulDuration = parseFloat(row.successful_duration) || 0;

        const totalMinutes = totalDuration / 60;
        const asr = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;
        const acd = successfulCalls > 0 ? successfulDuration / successfulCalls : 0;

        console.log(`⚡ Consumption query executed in ${queryTime}ms - ${totalCalls} calls aggregated`);

        const duration = Date.now() - startTime;

        return reply.send({
          success: true,
          data: {
            totalCost,
            totalCalls,
            totalDuration,
            totalMinutes,
            successfulCalls,
            failedCalls,
            asr,
            acd,
            currency: 'EUR', // Default currency
          },
          meta: {
            accountId,
            startDate: start_date,
            endDate: end_date,
            queryTime: `${queryTime}ms`,
            totalTime: `${duration}ms`,
          },
        });
      } catch (error) {
        console.error('❌ Error fetching consumption data:', error);
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  );
}

