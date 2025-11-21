# CDR Database Optimization Guide

## Problem
Slow queries detected (5-20 seconds) for CDR fetching and consumption calculations.

## Root Cause
Missing database indexes on frequently queried columns:
- `i_account` - used in every query to filter by account
- `connect_time` - used for date range filtering
- Composite `(i_account, connect_time)` - most efficient for combined queries

## Solution: Add Database Indexes

### Step 1: Check Current Indexes

On your **master database** (not replica), run:

```bash
psql -h <master-host> -U <master-user> -d sippy
```

Then:

```sql
-- Check existing indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'cdrs';
```

### Step 2: Create Indexes on Master Database

**IMPORTANT:** Run these on the **MASTER** database. They will automatically replicate to the replica.

```sql
-- Index 1: i_account (for account filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_i_account 
ON cdrs(i_account);

-- Index 2: connect_time (for date range queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_connect_time 
ON cdrs(connect_time);

-- Index 3: Composite index (MOST IMPORTANT)
-- This will speed up queries with both i_account AND connect_time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_account_time 
ON cdrs(i_account, connect_time DESC);

-- Index 4: result (for filtering by success/failed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_result 
ON cdrs(result);

-- Index 5: Covering index for consumption queries
-- Includes all columns needed for aggregation (index-only scan)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_consumption 
ON cdrs(i_account, connect_time) 
INCLUDE (result, cost, duration);

-- Update statistics
ANALYZE cdrs;
```

**Why CONCURRENTLY?**
- Creates indexes without locking the table
- Safe to run on production
- Takes longer but doesn't block queries

### Step 3: Wait for Replication

After creating indexes on master:

```bash
# On replica, check replication lag
psql -h localhost -U replica_monitor -d sippy -c "
SELECT 
  CASE 
    WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() 
    THEN 0 
    ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())
  END AS lag_seconds;
"
```

Wait until lag is 0 or very small (< 1 second).

### Step 4: Verify Indexes on Replica

```bash
# Check indexes replicated to replica
psql -h localhost -U replica_monitor -d sippy -c "
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'cdrs' 
ORDER BY indexname;
"
```

### Step 5: Test Query Performance

```bash
# Test a consumption query
psql -h localhost -U replica_monitor -d sippy -c "
EXPLAIN ANALYZE
SELECT COUNT(*) as total_calls, 
       COALESCE(SUM(cost), 0) as total_cost, 
       COALESCE(SUM(duration), 0) as total_duration
FROM cdrs
WHERE i_account = 14
  AND connect_time >= '2025-11-20 00:00:00'
  AND connect_time <= '2025-11-21 23:59:59';
"
```

Look for:
- ✅ `Index Scan using idx_cdrs_account_time` or `idx_cdrs_consumption`
- ❌ `Seq Scan` (means indexes not being used)

## Expected Performance Improvements

| Query Type | Before | After | Improvement |
|------------|--------|-------|-------------|
| Consumption (1 day) | 16s | <100ms | **160x faster** |
| CDR List (500 records) | 4-5s | <500ms | **10x faster** |
| CDR List (200K records) | 10-20s | 2-3s | **5-7x faster** |

## Index Sizes (Estimated)

For a table with ~2M CDR records:

- `idx_cdrs_i_account`: ~50 MB
- `idx_cdrs_connect_time`: ~50 MB
- `idx_cdrs_account_time`: ~70 MB
- `idx_cdrs_result`: ~40 MB
- `idx_cdrs_consumption`: ~100 MB (covering index)

**Total:** ~310 MB of indexes

## Maintenance

Indexes are automatically maintained by PostgreSQL. No manual maintenance needed.

### Rebuild Indexes (if needed)

If indexes become bloated over time:

```sql
-- On master database
REINDEX INDEX CONCURRENTLY idx_cdrs_account_time;
REINDEX INDEX CONCURRENTLY idx_cdrs_consumption;
```

## Monitoring

### Check Index Usage

```sql
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'cdrs'
ORDER BY idx_scan DESC;
```

### Check Slow Queries

```sql
-- Enable slow query logging (on master)
ALTER DATABASE sippy SET log_min_duration_statement = 1000; -- Log queries > 1s

-- Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*-main.log | grep "duration:"
```

## Troubleshooting

### Indexes Not Being Used

1. **Update statistics:**
   ```sql
   ANALYZE cdrs;
   ```

2. **Check if indexes exist:**
   ```sql
   \d cdrs
   ```

3. **Force index usage (testing only):**
   ```sql
   SET enable_seqscan = off;
   -- Run your query
   SET enable_seqscan = on;
   ```

### Replication Lag

If indexes take long to replicate:

```bash
# Check replication status
psql -h localhost -U replica_monitor -d sippy -c "
SELECT 
    pg_size_pretty(pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())) AS replication_lag_bytes,
    EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()) AS lag_seconds;
"
```

## Alternative: If You Can't Access Master

If you only have access to the replica and can't create indexes on master:

1. **Contact your database administrator** to create the indexes
2. **Use the SQL script:** Send them `optimize-indexes.sql`
3. **Explain the impact:** Show them the slow query logs

## Quick Script

Save this as `create-indexes.sh` and run on master:

```bash
#!/bin/bash
psql -h <master-host> -U <master-user> -d sippy << 'EOF'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_i_account ON cdrs(i_account);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_connect_time ON cdrs(connect_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_account_time ON cdrs(i_account, connect_time DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_result ON cdrs(result);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cdrs_consumption ON cdrs(i_account, connect_time) INCLUDE (result, cost, duration);
ANALYZE cdrs;
SELECT indexname FROM pg_indexes WHERE tablename = 'cdrs' ORDER BY indexname;
EOF
```

## Summary

✅ **5 indexes to create** on the master database
✅ **Use CONCURRENTLY** to avoid locking
✅ **Wait for replication** before testing
✅ **Expected 10-160x performance improvement**
✅ **~310 MB additional disk space** for indexes

After creating these indexes, your slow queries should drop from 5-20 seconds to under 1 second! 🚀

