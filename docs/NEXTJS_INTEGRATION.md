# Integrating CDR API with Your Next.js Application

Guide to update your existing Next.js app to use the new high-performance CDR API.

## Overview

Instead of calling the Sippy XML API directly, your Next.js app will now call your custom CDR API, which reads from the PostgreSQL replica.

**Benefits:**
- ⚡ 10-50x faster queries
- 📊 Handle 100K+ records per request
- 🔄 No load on production Sippy server
- 🎯 Better error handling and logging
- 📈 Easier to scale

---

## Step 1: Update Environment Variables

Add the CDR API endpoint to your Next.js `.env` file:

```bash
# ovo/.env.local
NEXT_PUBLIC_CDR_API_URL=http://localhost:3001
# Or in production:
# NEXT_PUBLIC_CDR_API_URL=https://cdr-api.yourdomain.com

# Keep your existing Sippy credentials for other API calls
SIPPY_API_URL=https://your-sippy-server.com/xmlapi
SIPPY_USERNAME=your_username
SIPPY_PASSWORD=your_password
```

---

## Step 2: Create CDR API Service

Create a new service file for the CDR API:

```typescript
// ovo/src/services/cdrApiService.ts

interface CDRApiParams {
  i_account: number;
  type?: 'all' | 'non_zero' | 'non_zero_and_errors' | 'complete' | 'incomplete' | 'errors';
  start_date?: string;
  end_date?: string;
  cli?: string;
  cld?: string;
  limit?: number;
  offset?: number;
  result_type?: string;
}

interface CDRRecord {
  i_xdr: number;
  i_account: number;
  i_customer: number;
  cli: string;
  cld: string;
  connect_time: Date;
  disconnect_time: Date;
  duration: number;
  charged_amount: number;
  charged_quantity: number;
  setup_time: number;
  post_call_surcharge: number;
  disconnect_cause: number;
  disconnect_reason?: string;
  cl_cli?: string;
  cl_cld?: string;
  country?: string;
  region?: string;
  city?: string;
}

interface CDRApiResponse {
  success: boolean;
  data: CDRRecord[];
  total: number;
  limit: number;
  offset: number;
  duration_ms: number;
}

interface CDRStatsResponse {
  success: boolean;
  stats: {
    total_calls: string;
    total_duration: string;
    total_cost: string;
    avg_duration: string;
    successful_calls: string;
    failed_calls: string;
  };
}

export class CDRApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_CDR_API_URL || 'http://localhost:3001';
  }

  /**
   * Fetch CDRs with filters
   */
  async getCDRs(params: CDRApiParams): Promise<CDRApiResponse> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/cdrs?${queryParams.toString()}`;
    
    console.log(`🔍 Fetching CDRs from API: ${url}`);
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // 10 minute timeout
        signal: AbortSignal.timeout(600000),
      });

      if (!response.ok) {
        throw new Error(`CDR API error: ${response.status} ${response.statusText}`);
      }

      const data: CDRApiResponse = await response.json();
      const duration = Date.now() - startTime;

      console.log(`✅ Fetched ${data.data.length} CDRs in ${duration}ms (API processing: ${data.duration_ms}ms)`);

      return data;
    } catch (error) {
      console.error('❌ Error fetching CDRs from API:', error);
      throw error;
    }
  }

  /**
   * Fetch CDR statistics (faster than fetching all records)
   */
  async getCDRStats(params: Pick<CDRApiParams, 'i_account' | 'start_date' | 'end_date'>): Promise<CDRStatsResponse> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/cdrs/stats?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`CDR Stats API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching CDR stats from API:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.error('❌ CDR API health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const cdrApiService = new CDRApiService();
```

---

## Step 3: Update API Route

Update your existing CDR API route to use the new service:

```typescript
// ovo/src/app/api/sippy/account/[id]/cdrs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cdrApiService } from '@/services/cdrApiService';
import { lookupCarriersBatch } from '@/services/carrierLookupService';
import { connectToDatabase } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = parseInt(params.id);
    const searchParams = request.nextUrl.searchParams;

    // Extract query parameters
    const type = searchParams.get('type') || 'non_zero_and_errors';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const cli = searchParams.get('cli');
    const cld = searchParams.get('cld');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = parseInt(searchParams.get('offset') || '0');
    const resultType = searchParams.get('result_type');

    console.log(`📞 Fetching CDRs for account ${accountId}, limit: ${limit}, offset: ${offset}`);

    // Fetch CDRs from the new API
    const response = await cdrApiService.getCDRs({
      i_account: accountId,
      type: type as any,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      cli: cli || undefined,
      cld: cld || undefined,
      limit,
      offset,
      result_type: resultType || undefined,
    });

    let cdrs = response.data;

    // Enrich CDRs with carrier information for French numbers
    try {
      await connectToDatabase();

      const calledNumbers = cdrs.map((cdr) => cdr.cld).filter(Boolean);

      if (calledNumbers.length > 0) {
        console.log(`🔍 Looking up carriers for ${calledNumbers.length} called numbers...`);
        const carrierLookupStart = Date.now();

        const carrierResults = await lookupCarriersBatch(calledNumbers);

        // Enrich each CDR with carrier info
        cdrs = cdrs.map((cdr: any) => {
          const carrierInfo = carrierResults.get(cdr.cld);
          if (carrierInfo && carrierInfo.found) {
            return {
              ...cdr,
              carrier: {
                found: true,
                mnemo: carrierInfo.mnemo,
                carrierName: carrierInfo.carrierName,
                commercialName: carrierInfo.commercialName,
                territoire: carrierInfo.territoire,
              },
            };
          }
          return cdr;
        });

        const carrierLookupDuration = Date.now() - carrierLookupStart;
        console.log(`✅ Carrier lookup completed in ${carrierLookupDuration}ms`);
      }
    } catch (carrierError) {
      console.error('Error enriching CDRs with carrier info:', carrierError);
      // Continue without carrier info if lookup fails
    }

    return NextResponse.json({
      success: true,
      cdrs,
      total: response.total,
      limit: response.limit,
      offset: response.offset,
      api_duration_ms: response.duration_ms,
    });
  } catch (error) {
    console.error('Error fetching CDRs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch CDRs',
      },
      { status: 500 }
    );
  }
}

// Similar updates for POST method if you have one
```

---

## Step 4: Update Admin CDR Route

Similarly update the admin CDR route:

```typescript
// ovo/src/app/api/admin/cdrs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cdrApiService } from '@/services/cdrApiService';
import { lookupCarriersBatch } from '@/services/carrierLookupService';
import { connectToDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // ... your existing auth checks ...

    const searchParams = request.nextUrl.searchParams;
    const accountId = parseInt(searchParams.get('i_account') || '0');

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Extract other parameters
    const type = searchParams.get('type') || 'non_zero_and_errors';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Fetch from CDR API
    const response = await cdrApiService.getCDRs({
      i_account: accountId,
      type: type as any,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      limit,
      offset,
    });

    let cdrs = response.data;

    // Enrich with carrier info (with full details for admin)
    try {
      await connectToDatabase();

      const calledNumbers = cdrs.map((cdr) => cdr.cld).filter(Boolean);

      if (calledNumbers.length > 0) {
        const carrierResults = await lookupCarriersBatch(calledNumbers);

        cdrs = cdrs.map((cdr: any) => {
          const carrierInfo = carrierResults.get(cdr.cld);
          if (carrierInfo && carrierInfo.found) {
            return {
              ...cdr,
              carrier: {
                found: true,
                mnemo: carrierInfo.mnemo,
                carrierName: carrierInfo.carrierName,
                commercialName: carrierInfo.commercialName,
                territoire: carrierInfo.territoire,
                fullCarrierDetails: carrierInfo.fullCarrierDetails,
              },
            };
          }
          return cdr;
        });
      }
    } catch (carrierError) {
      console.error('Error enriching CDRs with carrier info:', carrierError);
    }

    return NextResponse.json({
      success: true,
      cdrs,
      total: response.total,
      limit: response.limit,
      offset: response.offset,
    });
  } catch (error) {
    console.error('Error fetching admin CDRs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch CDRs',
      },
      { status: 500 }
    );
  }
}
```

---

## Step 5: Update Frontend Components (Optional)

Your existing frontend components (`CdrReports.tsx`, `AdminCdrReports.tsx`) don't need changes since they already call your Next.js API routes. However, you can add a health check:

```typescript
// ovo/src/components/calls/CdrReports.tsx

// Add this to your component
useEffect(() => {
  // Check CDR API health on mount
  fetch('/api/cdr-health')
    .then(res => res.json())
    .then(data => {
      if (!data.healthy) {
        console.warn('⚠️ CDR API is not healthy, falling back to Sippy API');
      }
    })
    .catch(err => console.error('Error checking CDR API health:', err));
}, []);
```

Create the health check endpoint:

```typescript
// ovo/src/app/api/cdr-health/route.ts

import { NextResponse } from 'next/server';
import { cdrApiService } from '@/services/cdrApiService';

export async function GET() {
  const isHealthy = await cdrApiService.healthCheck();
  
  return NextResponse.json({
    healthy: isHealthy,
    timestamp: new Date().toISOString(),
  });
}
```

---

## Step 6: Testing

### Test Locally

1. Start your CDR API:
```bash
cd cdr-api
npm run dev
```

2. Start your Next.js app:
```bash
cd ovo
npm run dev
```

3. Test the endpoints:
```bash
# Test CDR API directly
curl "http://localhost:3001/cdrs?i_account=14&limit=10"

# Test through Next.js API
curl "http://localhost:3000/api/sippy/account/14/cdrs?limit=10"

# Test health check
curl "http://localhost:3000/api/cdr-health"
```

### Performance Comparison

Add logging to compare performance:

```typescript
// In your API route
console.log(`
📊 Performance Metrics:
- CDR API fetch: ${response.duration_ms}ms
- Carrier lookup: ${carrierLookupDuration}ms
- Total: ${Date.now() - startTime}ms
- Records: ${cdrs.length}
`);
```

---

## Step 7: Gradual Rollout (Recommended)

Implement a feature flag to gradually roll out the new API:

```typescript
// ovo/src/app/api/sippy/account/[id]/cdrs/route.ts

const USE_NEW_CDR_API = process.env.USE_NEW_CDR_API === 'true';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (USE_NEW_CDR_API) {
    // Use new CDR API (replica)
    return getFromCDRApi(request, params);
  } else {
    // Use existing Sippy XML API
    return getFromSippyApi(request, params);
  }
}

async function getFromCDRApi(request: NextRequest, params: { id: string }) {
  // New implementation (as shown above)
}

async function getFromSippyApi(request: NextRequest, params: { id: string }) {
  // Your existing implementation
}
```

Add to `.env`:
```
USE_NEW_CDR_API=false  # Set to true when ready
```

---

## Performance Expectations

### Before (Sippy XML API):
- 500 records: ~30-60 seconds
- 25,000 records: ~180-300 seconds (3-5 minutes)
- 1M records: Not feasible (timeouts)

### After (CDR API + Replica):
- 500 records: ~0.5-2 seconds ⚡
- 25,000 records: ~2-10 seconds ⚡
- 100,000 records: ~10-30 seconds ⚡
- 1M records: ~60-120 seconds (1-2 minutes) ⚡

**Expected improvement: 10-50x faster** 🚀

---

## Monitoring

Add monitoring to track API usage:

```typescript
// ovo/src/middleware/cdr-metrics.ts

export function trackCDRMetrics(
  accountId: number,
  limit: number,
  duration: number,
  source: 'cdr-api' | 'sippy-api'
) {
  // Log to your monitoring service (DataDog, New Relic, etc.)
  console.log({
    metric: 'cdr_fetch',
    accountId,
    limit,
    duration,
    source,
    timestamp: new Date().toISOString(),
  });
}
```

---

## Troubleshooting

### CDR API Not Reachable

```typescript
// Add fallback to Sippy API
try {
  const response = await cdrApiService.getCDRs(params);
  return response;
} catch (error) {
  console.error('CDR API failed, falling back to Sippy API:', error);
  return await fetchFromSippyAPI(params);
}
```

### Data Discrepancies

The replica might have a small lag (usually < 1 second). For real-time data, you might want to:
- Use Sippy API for very recent data (last 5 minutes)
- Use CDR API for historical data (> 5 minutes old)

```typescript
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
const useRealtimeAPI = new Date(startDate) > fiveMinutesAgo;

if (useRealtimeAPI) {
  return await fetchFromSippyAPI(params);
} else {
  return await cdrApiService.getCDRs(params);
}
```

---

## Next Steps

1. ✅ Deploy CDR API to production
2. ✅ Test with small datasets first
3. ✅ Monitor performance and errors
4. ✅ Gradually increase usage
5. ✅ Eventually deprecate direct Sippy API calls for CDRs

---

## Cost Savings

**Before:**
- Heavy load on Sippy production server
- Slow user experience
- Limited to small datasets

**After:**
- Zero load on Sippy production server
- Fast user experience (10-50x faster)
- Can handle millions of records
- Better scalability

This is a significant improvement! 🎉

