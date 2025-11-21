# Cursor-Based Pagination Guide

## The Problem with OFFSET

When fetching large datasets with OFFSET/LIMIT pagination:

```
OFFSET 0     LIMIT 25000  →  Fast (25s)
OFFSET 100000 LIMIT 25000  →  Slow (40s)  ❌
OFFSET 475000 LIMIT 25000  →  Very Slow (50s+)  ❌❌
```

**Why?** PostgreSQL must scan and skip all previous rows before returning your data.

## The Solution: Cursor-Based Pagination

Instead of OFFSET, use the last record as a "cursor" to fetch the next batch.

### Performance Comparison

| Method | First Batch | Batch at 100k | Batch at 500k |
|--------|-------------|---------------|---------------|
| OFFSET | 25s | 40s | 50s+ |
| CURSOR | 25s | 25s | 25s ✅ |

**Result:** Consistent performance regardless of how deep you paginate!

## How to Use

### 1. First Request (No Cursor)

```bash
GET /cdrs?i_account=14&limit=25000&start_date=2025-11-20+00:00:00&end_date=2025-11-20+23:59:59
```

**Response:**
```json
{
  "success": true,
  "data": [...25000 records...],
  "limit": 25000,
  "offset": 0,
  "duration_ms": 2500,
  "next_cursor": "2025-11-20T23:45:30.123Z,12345678"
}
```

### 2. Next Request (With Cursor)

Use the `next_cursor` from the previous response:

```bash
GET /cdrs?i_account=14&limit=25000&cursor=2025-11-20T23:45:30.123Z,12345678&start_date=2025-11-20+00:00:00&end_date=2025-11-20+23:59:59
```

**Response:**
```json
{
  "success": true,
  "data": [...25000 more records...],
  "limit": 25000,
  "offset": 0,
  "duration_ms": 2500,
  "next_cursor": "2025-11-20T23:30:15.456Z,12370678"
}
```

### 3. Continue Until Done

Keep using the `next_cursor` until you get an empty `data` array or no `next_cursor`.

## Frontend Implementation Example

```typescript
async function fetchAllCDRs(accountId: number, startDate: string, endDate: string) {
  const allRecords = [];
  let cursor = null;
  let batchNumber = 1;
  
  while (true) {
    console.log(`Fetching batch ${batchNumber}...`);
    
    // Build URL
    const params = new URLSearchParams({
      i_account: accountId.toString(),
      limit: '25000',
      start_date: startDate,
      end_date: endDate,
      type: 'non_zero_and_errors'
    });
    
    // Add cursor if we have one
    if (cursor) {
      params.append('cursor', cursor);
    }
    
    // Fetch batch
    const response = await fetch(`/cdrs?${params}`);
    const result = await response.json();
    
    // Add to results
    allRecords.push(...result.data);
    console.log(`Fetched ${result.data.length} records (total: ${allRecords.length})`);
    
    // Check if we're done
    if (!result.next_cursor || result.data.length === 0) {
      break;
    }
    
    // Use cursor for next batch
    cursor = result.next_cursor;
    batchNumber++;
  }
  
  return allRecords;
}
```

## Parallel Fetching (Advanced)

You can still use OFFSET for parallel fetching of the first few batches, then switch to cursor:

```typescript
async function fetchCDRsParallel(accountId: number, startDate: string, endDate: string) {
  // Fetch first 5 batches in parallel (fast with OFFSET for small offsets)
  const firstBatches = await Promise.all([
    fetchBatch(accountId, 0, 25000),
    fetchBatch(accountId, 25000, 25000),
    fetchBatch(accountId, 50000, 25000),
    fetchBatch(accountId, 75000, 25000),
    fetchBatch(accountId, 100000, 25000),
  ]);
  
  const allRecords = firstBatches.flat();
  
  // Get cursor from last batch
  const lastBatch = firstBatches[4];
  let cursor = lastBatch.next_cursor;
  
  // Continue with cursor-based pagination
  while (cursor) {
    const result = await fetchWithCursor(accountId, cursor);
    allRecords.push(...result.data);
    cursor = result.next_cursor;
  }
  
  return allRecords;
}
```

## When to Use Each Method

### Use OFFSET when:
- ✅ Small datasets (< 100k records)
- ✅ Random access to specific pages needed
- ✅ Offset is small (< 10k)

### Use CURSOR when:
- ✅ Large datasets (> 100k records)
- ✅ Sequential pagination (load more)
- ✅ Deep pagination (offset > 10k)
- ✅ Consistent performance needed

## API Behavior

- If `cursor` parameter is provided, OFFSET is ignored
- Cursor format: `timestamp,i_cdr` (e.g., `2025-11-20T23:45:30.123Z,12345678`)
- Cursor is always returned in response if there are more records
- Empty `next_cursor` means you've reached the end

## Notes

- Cursor-based pagination maintains consistent performance at any depth
- You cannot jump to arbitrary pages with cursors (sequential only)
- Cursors are stateless - no server-side session needed
- Works perfectly with your existing indexes!

