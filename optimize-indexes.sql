-- CDR Database Index Optimization
-- Run this on the MASTER database (not the replica)
-- These indexes will automatically replicate to the replica

-- Check existing indexes first
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'cdrs'
ORDER BY indexname;

-- Index 1: i_account (for filtering by account)
-- This is critical for queries like: WHERE i_account = 14
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_i_account 
ON cdrs(i_account);

-- Index 2: connect_time (for date range queries)
-- This is critical for queries like: WHERE connect_time >= '2025-11-20' AND connect_time <= '2025-11-21'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_connect_time 
ON cdrs(connect_time);

-- Index 3: Composite index (i_account, connect_time) - MOST IMPORTANT
-- This is critical for queries like: WHERE i_account = 14 AND connect_time >= '2025-11-20'
-- This will be used for most CDR API queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_account_time 
ON cdrs(i_account, connect_time DESC);

-- Index 4: result (for filtering by call result - success/failed)
-- This helps with queries filtering by result type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_result 
ON cdrs(result);

-- Index 5: Composite for consumption queries (i_account, connect_time, result, cost, duration)
-- This is a covering index that includes all columns needed for consumption aggregation
-- PostgreSQL can use this for index-only scans (much faster)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_consumption 
ON cdrs(i_account, connect_time) 
INCLUDE (result, cost, duration);

-- Analyze the table to update statistics
ANALYZE cdrs;

-- Check index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename = 'cdrs'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Verify indexes are being used
-- Run this after creating indexes and test a query
EXPLAIN ANALYZE
SELECT COUNT(*) as total_calls, 
       COALESCE(SUM(cost), 0) as total_cost, 
       COALESCE(SUM(duration), 0) as total_duration
FROM cdrs
WHERE i_account = 14
  AND connect_time >= '2025-11-20 00:00:00'
  AND connect_time <= '2025-11-21 23:59:59';

