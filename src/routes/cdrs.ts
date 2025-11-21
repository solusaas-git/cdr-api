import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';
import { CDRQueryParams, CDRResponse, CDRRecord } from '../types';

interface CDRQuerystring {
  i_account?: string; // Optional - if not provided, query all accounts
  type?: string;
  start_date?: string;
  end_date?: string;
  cli?: string;
  cld?: string;
  limit?: string;
  offset?: string;
  result_type?: string;
  include_count?: string; // Set to 'true' to include total count (slower)
  cursor?: string; // Cursor-based pagination (faster for large offsets) - format: "timestamp,i_cdr"
}

export async function cdrRoutes(fastify: FastifyInstance) {
  // GET /cdrs - Fetch CDRs with filters
  fastify.get<{ Querystring: CDRQuerystring }>(
    '/cdrs',
    async (request: FastifyRequest<{ Querystring: CDRQuerystring }>, reply: FastifyReply) => {
      const startTime = Date.now();
      const timings: Record<string, number> = {};

      try {
        const {
          i_account,
          type = 'non_zero_and_errors',
          start_date,
          end_date,
          cli,
          cld,
          limit = '500',
          offset = '0',
          result_type,
          include_count,
          cursor,
        } = request.query;

        const limitNum = Math.min(parseInt(limit), 200000); // Max 200K per request
        const offsetNum = parseInt(offset);
        const useCursor = !!cursor && offsetNum === 0; // Use cursor if provided and no offset
        
        const queryBuildStart = Date.now();

        // Build the SQL query - Only fetch fields used in frontend (optimized)
        // Fields used: i_cdr, i_call, cli, cld, connect_time, duration, billed_duration, 
        // cost, country, description, protocol, result, remote_ip
        let sql = `
          SELECT 
            cdrs.i_cdr,
            cdrs.i_call,
            cdrs.cli_in as cli,
            cdrs.cld_in as cld,
            cdrs.connect_time,
            cdrs.duration,
            cdrs.billed_duration,
            cdrs.cost,
            cdrs.remote_ip,
            cdrs.result,
            COALESCE(protocols.name, cdrs.i_protocol::text) as protocol,
            COALESCE(countries.name, destinations.country_iso) as country,
            destinations.description
          FROM cdrs
          LEFT JOIN destinations ON cdrs.prefix = destinations.prefix
          LEFT JOIN countries ON destinations.country_iso = countries.iso
          LEFT JOIN protocols ON cdrs.i_protocol = protocols.i_protocol
          WHERE 1=1
        `;

        const params: any[] = [];
        let paramIndex = 1;

        // Add account filter if provided
        if (i_account) {
          const accountId = parseInt(i_account);
          sql += ` AND i_account = $${paramIndex}`;
          params.push(accountId);
          paramIndex++;
          console.log(`📊 Fetching CDRs for account ${accountId}`);
        } else {
          console.log(`📊 Fetching CDRs for ALL accounts (admin query)`);
        }

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

        // Add CLI filter (use cli_in column name)
        if (cli) {
          sql += ` AND cli_in LIKE $${paramIndex}`;
          params.push(`%${cli}%`);
          paramIndex++;
        }

        // Add CLD filter (use cld_in column name)
        if (cld) {
          sql += ` AND cld_in LIKE $${paramIndex}`;
          params.push(`%${cld}%`);
          paramIndex++;
        }

        // Add type filter
        switch (type) {
          case 'non_zero':
            sql += ' AND duration > 0';
            break;
          case 'non_zero_and_errors':
            sql += ' AND (duration > 0 OR result != 0)';
            break;
          case 'complete':
            sql += ' AND result = 0';
            break;
          case 'incomplete':
            sql += ' AND result != 0';
            break;
          case 'errors':
            sql += ' AND result != 0 AND duration = 0';
            break;
        }

        // Add result_type filter if provided
        if (result_type && result_type !== 'all') {
          // Add your result_type filtering logic here based on disconnect_cause
          // This depends on how Sippy categorizes result types
        }

        // Add cursor-based pagination (much faster for large datasets)
        if (useCursor) {
          const [cursorTime, cursorId] = cursor!.split(',');
          sql += ` AND (connect_time, i_cdr) < ($${paramIndex}, $${paramIndex + 1})`;
          params.push(cursorTime, parseInt(cursorId));
          paramIndex += 2;
        }

        // Add ordering
        sql += ' ORDER BY connect_time DESC, i_cdr DESC';

        // Add pagination
        if (useCursor) {
          sql += ` LIMIT $${paramIndex}`;
          params.push(limitNum);
        } else {
        sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limitNum, offsetNum);
        }

        timings.query_build_ms = Date.now() - queryBuildStart;

        console.log(`📊 Query params: limit=${limitNum}, ${useCursor ? `cursor=${cursor}` : `offset=${offsetNum}`}, account=${i_account || 'ALL'}`);
        console.log(`🔧 Query build time: ${timings.query_build_ms}ms`);

        // Execute query
        const queryStart = Date.now();
        const rows = await query<CDRRecord>(sql, params);
        timings.main_query_ms = Date.now() - queryStart;
        console.log(`⚡ Main query executed in ${timings.main_query_ms}ms - returned ${rows.length} rows`);

        // Get total count only if requested (expensive for large datasets)
        let total: number | undefined;

        if (include_count === 'true') {
          const countStart = Date.now();
        const countSql = sql.substring(0, sql.indexOf('ORDER BY')).replace(
          /SELECT[\s\S]*?FROM/,
          'SELECT COUNT(*) as count FROM'
        );
        const countParams = params.slice(0, -2); // Remove LIMIT and OFFSET
        const countResult = await query<{ count: string }>(countSql, countParams);
          total = parseInt(countResult[0]?.count || '0');
          timings.count_query_ms = Date.now() - countStart;
          console.log(`🔢 Count query executed in ${timings.count_query_ms}ms - total: ${total}`);
        }

        const duration = Date.now() - startTime;
        timings.total_ms = duration;
        timings.overhead_ms = duration - (timings.main_query_ms || 0) - (timings.count_query_ms || 0) - (timings.query_build_ms || 0);

        // Generate next cursor for pagination
        let nextCursor: string | undefined;
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          // Convert timestamp to ISO string for consistent format
          const timestamp = new Date(lastRow.connect_time).toISOString();
          nextCursor = `${timestamp},${lastRow.i_cdr}`;
        }

        const response: CDRResponse = {
          success: true,
          data: rows,
          total,
          limit: limitNum,
          offset: offsetNum,
          duration_ms: duration,
          next_cursor: nextCursor,
        };

        console.log(`✅ REQUEST COMPLETE - ${rows.length} CDRs in ${duration}ms`);
        console.log(`📊 TIMING BREAKDOWN:`, {
          query_build: `${timings.query_build_ms}ms`,
          main_query: `${timings.main_query_ms}ms`,
          count_query: include_count === 'true' ? `${timings.count_query_ms}ms` : 'skipped',
          overhead: `${timings.overhead_ms}ms`,
          total: `${timings.total_ms}ms`
        });

        return reply.send(response);
      } catch (error) {
        console.error('❌ Error fetching CDRs:', error);
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  );

  // GET /cdrs/stats - Get CDR statistics (faster than fetching all records)
  fastify.get<{ Querystring: CDRQuerystring }>(
    '/cdrs/stats',
    async (request: FastifyRequest<{ Querystring: CDRQuerystring }>, reply: FastifyReply) => {
      try {
        const { i_account, start_date, end_date } = request.query;

        if (!i_account) {
          return reply.code(400).send({
            success: false,
            error: 'i_account is required',
          });
        }

        const accountId = parseInt(i_account);

        let sql = `
          SELECT 
            COUNT(*) as total_calls,
            SUM(duration) as total_duration,
            SUM(cost) as total_cost,
            AVG(duration) as avg_duration,
            COUNT(CASE WHEN result = 0 THEN 1 END) as successful_calls,
            COUNT(CASE WHEN result != 0 THEN 1 END) as failed_calls
          FROM cdrs
          WHERE i_account = $1
        `;

        const params: any[] = [accountId];
        let paramIndex = 2;

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

        const result = await query(sql, params);

        return reply.send({
          success: true,
          stats: result[0],
        });
      } catch (error) {
        console.error('❌ Error fetching CDR stats:', error);
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  );

  // GET /cdrs/top-destinations - Get top destinations by call count and cost
  fastify.get<{ Querystring: CDRQuerystring }>(
    '/cdrs/top-destinations',
    async (request: FastifyRequest<{ Querystring: CDRQuerystring }>, reply: FastifyReply) => {
      try {
        const { i_account, start_date, end_date, limit = '20' } = request.query;

        if (!i_account) {
          return reply.code(400).send({
            success: false,
            error: 'i_account is required',
          });
        }

        const accountId = parseInt(i_account);
        const limitNum = Math.min(parseInt(limit), 100);

        let sql = `
          SELECT 
            cld_in as destination,
            prefix,
            COUNT(*) as total_calls,
            SUM(duration) as total_duration,
            SUM(cost) as total_cost,
            AVG(duration) as avg_duration,
            COUNT(CASE WHEN result = 0 THEN 1 END) as successful_calls,
            COUNT(CASE WHEN result != 0 THEN 1 END) as failed_calls
          FROM cdrs
          WHERE i_account = $1
        `;

        const params: any[] = [accountId];
        let paramIndex = 2;

        if (start_date) {
          sql += ` AND connect_time >= $${paramIndex}`;
          params.push(start_date);
          paramIndex++;
        }

        if (end_date) {
          sql += ` AND connect_time < $${paramIndex}`;
          params.push(end_date);
          paramIndex++;
        }

        sql += `
          GROUP BY cld_in, prefix
          ORDER BY total_cost DESC
          LIMIT $${paramIndex}
        `;
        params.push(limitNum);

        console.log(`📊 Fetching top destinations for account ${accountId}`);

        const result = await query(sql, params);

        return reply.send({
          success: true,
          data: result,
          count: result.length,
        });
      } catch (error) {
        console.error('❌ Error fetching top destinations:', error);
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  );

  // Replication status endpoint
  fastify.get('/replication-status', async (request, reply) => {
    try {
      const result = await query(`
        SELECT 
          pg_last_wal_receive_lsn() AS receive_lsn,
          pg_last_wal_replay_lsn() AS replay_lsn,
          pg_last_xact_replay_timestamp() AS replay_timestamp,
          EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds
      `);
      
      const status = result[0];
      
      return reply.send({
        success: true,
        replication: {
          lastReplayTimestamp: status.replay_timestamp,
          lagSeconds: parseFloat(status.lag_seconds || '0'),
          lagMinutes: Math.round(parseFloat(status.lag_seconds || '0') / 60),
          isHealthy: parseFloat(status.lag_seconds || '0') < 300 // Healthy if lag < 5 minutes
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ Error fetching replication status:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

