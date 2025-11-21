# CDR API Integration Guide for OVO App

## 🎯 Overview

This guide explains how to integrate the high-performance CDR API (PostgreSQL replica) with your OVO Next.js application to replace the slow Sippy XML API.

## 📊 Performance Comparison

| Metric | Sippy XML API | CDR API (Replica) | Improvement |
|--------|---------------|-------------------|-------------|
| **Query Speed** | 97 seconds | 11 seconds | **9x faster** |
| **Data Format** | XML | JSON | Native |
| **Connection** | HTTP/XML-RPC | REST/JSON | Modern |
| **Scalability** | Limited | High | Better |
| **Real-time** | No | Yes (< 1s lag) | ✅ |

## 🔧 Integration Steps

### Step 1: Environment Configuration

Add to your `.env.local` and `.env.production`:

```bash
# CDR API Configuration
CDR_API_URL=http://88.99.195.187:3002  # For production
# CDR_API_URL=http://localhost:3002    # For local development
CDR_API_SECRET=your_api_secret_here    # Optional: for API authentication
```

### Step 2: API Proxy Endpoint

The proxy endpoint is already created at `/api/cdr-proxy/route.ts`. It provides:

#### GET `/api/cdr-proxy` - Fetch CDRs

**Query Parameters:**
- `i_account` (required): Sippy account ID
- `start_date` (optional): ISO date format (e.g., "2025-11-19")
- `end_date` (optional): ISO date format
- `cli` (optional): Filter by calling number
- `cld` (optional): Filter by called number
- `limit` (optional): Number of records (default: 500)
- `offset` (optional): Pagination offset (default: 0)
- `type` (optional): Filter type (default: "non_zero_and_errors")

**Response:**
```json
{
  "success": true,
  "cdrs": [...],
  "count": 5,
  "total": 27,
  "requestDuration": 11225,
  "debugInfo": {
    "source": "cdr_api_replica",
    "cdrApiDuration": 11000,
    "totalDuration": 11225
  }
}
```

#### POST `/api/cdr-proxy` - Fetch Statistics

**Request Body:**
```json
{
  "i_account": 14,
  "start_date": "2025-11-19",
  "end_date": "2025-11-20",
  "endpoint": "stats"  // or "top-destinations"
}
```

**Response (stats):**
```json
{
  "success": true,
  "stats": {
    "total_calls": "2146872",
    "total_duration": 9600412.18,
    "total_cost": 1666.63,
    "avg_duration": 4.47,
    "successful_calls": "1420058",
    "failed_calls": "726814"
  }
}
```

**Response (top-destinations):**
```json
{
  "success": true,
  "data": [
    {
      "destination": "33613594973",
      "prefix": "336",
      "total_calls": "1",
      "total_duration": 2399.10,
      "total_cost": 0.56,
      "avg_duration": 2399.10,
      "successful_calls": "1",
      "failed_calls": "0"
    }
  ],
  "count": 20
}
```

### Step 3: Update User CDR Page

**File:** `/src/app/services/cdrs/page.tsx` (or wherever your user CDR page is)

Replace the Sippy API call with:

```typescript
// OLD: Using Sippy XML API
const response = await fetch(`/api/sippy/account/${accountId}/cdrs?${params}`);

// NEW: Using CDR API via proxy
const response = await fetch(`/api/cdr-proxy?${params}`);
```

**Example Implementation:**

```typescript
async function fetchCDRs() {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      i_account: user.sippyAccountId.toString(),
      start_date: startDate,
      end_date: endDate,
      limit: '500',
      offset: '0',
    });

    const response = await fetch(`/api/cdr-proxy?${params}`);
    const data = await response.json();

    if (data.success) {
      setCdrs(data.cdrs);
      setTotal(data.total);
      console.log(`✅ Loaded ${data.count} CDRs in ${data.requestDuration}ms`);
    } else {
      console.error('Failed to fetch CDRs:', data.error);
    }
  } catch (error) {
    console.error('Error fetching CDRs:', error);
  } finally {
    setLoading(false);
  }
}
```

### Step 4: Update Admin CDR Page

**File:** `/src/app/admin/cdrs/page.tsx`

The admin page can use the same proxy endpoint, or you can create a dedicated admin endpoint that supports:
- Filtering by multiple users
- System-wide CDR access
- Advanced analytics

**Example:**

```typescript
// Fetch CDRs for a specific user (admin view)
const params = new URLSearchParams({
  i_account: selectedUserId.toString(),
  start_date: startDate,
  end_date: endDate,
  limit: '1000',
});

const response = await fetch(`/api/cdr-proxy?${params}`);
```

### Step 5: Add Statistics Dashboard

Create a new widget or page to display CDR statistics:

```typescript
async function fetchStatistics() {
  const response = await fetch('/api/cdr-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      i_account: user.sippyAccountId,
      start_date: '2025-11-19',
      end_date: '2025-11-20',
      endpoint: 'stats',
    }),
  });

  const data = await response.json();
  
  if (data.success) {
    console.log('Total calls:', data.stats.total_calls);
    console.log('Total cost:', data.stats.total_cost);
    console.log('Success rate:', 
      (data.stats.successful_calls / data.stats.total_calls * 100).toFixed(2) + '%'
    );
  }
}
```

### Step 6: Add Top Destinations Widget

```typescript
async function fetchTopDestinations() {
  const response = await fetch('/api/cdr-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      i_account: user.sippyAccountId,
      start_date: '2025-11-19',
      end_date: '2025-11-20',
      endpoint: 'top-destinations',
    }),
  });

  const data = await response.json();
  
  if (data.success) {
    // Display top destinations in a table or chart
    data.data.forEach((dest: any) => {
      console.log(`${dest.destination}: ${dest.total_calls} calls, €${dest.total_cost}`);
    });
  }
}
```

## 🚀 Deployment

### Option 1: Keep CDR API on Local Machine (Development Only)

```bash
# In cdr-api directory
npm run dev
```

**Pros:** Easy for development
**Cons:** Not accessible from production

### Option 2: Deploy CDR API on Replica Server (Recommended)

1. **Copy CDR API to replica server:**

```bash
# On your local machine
cd /Users/macbook/Documents/projects/sipp/cdr-api
tar -czf cdr-api.tar.gz --exclude=node_modules --exclude=.git .

# Upload to replica server
scp cdr-api.tar.gz user@88.99.195.187:/home/user/
```

2. **On replica server:**

```bash
# Extract and setup
cd /home/user
tar -xzf cdr-api.tar.gz -C cdr-api
cd cdr-api

# Install dependencies
npm install

# Update .env for production
nano .env
# Change:
# DB_HOST=localhost  # Connect to local PostgreSQL
# API_PORT=3002
# ALLOWED_ORIGINS=https://your-ovo-domain.com

# Build and start with PM2
npm run build
pm2 start dist/index.js --name cdr-api
pm2 save
pm2 startup
```

3. **Configure Nginx (optional, for HTTPS):**

```nginx
server {
    listen 443 ssl;
    server_name cdr-api.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. **Update OVO `.env.production`:**

```bash
CDR_API_URL=https://cdr-api.your-domain.com
# or
CDR_API_URL=http://88.99.195.187:3002
```

## 🔒 Security Considerations

1. **Firewall Rules:**
   - Only allow CDR API access from your OVO server IP
   - Block public access to port 3002

```bash
# On replica server
sudo ufw allow from YOUR_OVO_SERVER_IP to any port 3002
```

2. **API Authentication (Optional):**
   - Add API key authentication to CDR API
   - Set `CDR_API_SECRET` in both CDR API and OVO app

3. **PostgreSQL Security:**
   - Keep PostgreSQL on `localhost` only
   - CDR API connects locally (no network exposure)

## 📈 Monitoring

### Check CDR API Health

```bash
curl http://localhost:3002/health
```

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-11-20T05:21:18.017Z"
}
```

### Check Replication Lag

```bash
# On replica server
psql -U replica_monitor -h localhost -d sippy -c "
  SELECT 
    CASE 
      WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() 
      THEN 0 
      ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())
    END as lag_seconds;
"
```

### Monitor with PM2

```bash
pm2 logs cdr-api
pm2 monit
```

## 🐛 Troubleshooting

### Issue: "Connection refused"

**Solution:** Check if CDR API is running:
```bash
pm2 list
curl http://localhost:3002/
```

### Issue: "canceling statement due to conflict with recovery"

**Solution:** Already fixed! We increased `max_standby_streaming_delay` to `-1`.

### Issue: Slow queries

**Solution:** Always use date filters:
```typescript
// ❌ Slow (queries all 49M records)
fetch('/api/cdr-proxy?i_account=14&limit=100')

// ✅ Fast (queries only today's records)
fetch('/api/cdr-proxy?i_account=14&start_date=2025-11-20&limit=100')
```

## 📚 API Reference

### Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cdrs` | GET | Fetch CDR records |
| `/cdrs/stats` | GET | Get aggregated statistics |
| `/cdrs/top-destinations` | GET | Get top called destinations |
| `/health` | GET | Health check |
| `/` | GET | API info |

### CDR Record Structure

```typescript
interface CDR {
  i_cdr: string;
  i_call: string;
  i_account: string;
  cli: string;              // Calling number
  cld: string;              // Called number
  connect_time: string;     // ISO timestamp
  disconnect_time: string;  // ISO timestamp
  duration: number;         // Seconds
  billed_duration: number;  // Seconds
  charged_amount: number;   // Cost
  result: string;           // "0" = success, other = error code
  release_source: string;   // "caller" or "callee"
  i_protocol: number;       // 1 = SIP
  remote_ip: string;
  user_agent: string;
  prefix: string;
  price_1: number;
  price_n: number;
}
```

## ✅ Testing Checklist

- [ ] CDR API running and accessible
- [ ] Health endpoint returns "healthy"
- [ ] User CDR page loads CDRs via proxy
- [ ] Admin CDR page loads CDRs via proxy
- [ ] Date filters work correctly
- [ ] Pagination works
- [ ] Statistics endpoint works
- [ ] Top destinations endpoint works
- [ ] Performance is significantly improved
- [ ] Firewall rules configured
- [ ] PM2 process running on replica server

## 🎉 Expected Results

After integration:
- **9x faster** CDR queries (11s vs 97s)
- **Real-time data** (< 1 second replication lag)
- **Better UX** (faster page loads, smoother experience)
- **Reduced load** on Sippy master server
- **Scalable** (can handle millions of records)

## 📞 Support

If you encounter any issues:
1. Check CDR API logs: `pm2 logs cdr-api`
2. Check PostgreSQL connection: `psql -U replica_monitor -h localhost -d sippy`
3. Test CDR API directly: `curl http://localhost:3002/health`
4. Check firewall: `sudo ufw status`

---

**Next Steps:** Start with Step 1 (Environment Configuration) and work through each step. Test thoroughly in development before deploying to production.

