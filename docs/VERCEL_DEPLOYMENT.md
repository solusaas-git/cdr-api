# CDR API - Vercel Deployment Guide

## 📋 Overview

This guide explains how to deploy the Fastify CDR API as a separate Vercel project on the subdomain `cdrs.ovoky.io`.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Setup                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  app.ovoky.io                    cdrs.ovoky.io             │
│  ┌──────────────┐                ┌──────────────┐          │
│  │              │   HTTP/HTTPS   │              │          │
│  │   OVO App    │ ─────────────> │   CDR API    │          │
│  │  (Next.js)   │                │  (Fastify)   │          │
│  │              │                │              │          │
│  └──────────────┘                └──────────────┘          │
│         │                               │                   │
│         │                               │                   │
│         ▼                               ▼                   │
│  ┌──────────────┐                ┌──────────────┐          │
│  │   MongoDB    │                │  PostgreSQL  │          │
│  │  (Users DB)  │                │  (CDRs DB)   │          │
│  └──────────────┘                └──────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Deployment Steps

### 1. Create `vercel.json` for CDR API

Create this file in the `cdr-api` directory:

```json
{
  "version": 2,
  "name": "cdr-api",
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.ts"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "regions": ["iad1"]
}
```

### 2. Update `package.json`

Add Vercel-specific scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "vercel-build": "echo 'No build step needed for serverless'",
    "type-check": "tsc --noEmit"
  }
}
```

### 3. Create Vercel Project

```bash
# Navigate to cdr-api directory
cd /path/to/sipp/cdr-api

# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Initialize project
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your team/account
# - Link to existing project? No
# - Project name? cdr-api
# - Directory? ./
# - Override settings? No
```

### 4. Configure Environment Variables

In Vercel Dashboard for the CDR API project:

```bash
# Database
POSTGRES_HOST=your-postgres-host
POSTGRES_PORT=5432
POSTGRES_DATABASE=sippy
POSTGRES_USER=sippy
POSTGRES_PASSWORD=your-password
POSTGRES_SSL=true

# API Configuration
PORT=3002
API_HOST=0.0.0.0
CDR_API_SECRET=your-secure-api-secret

# CORS (Important!)
ALLOWED_ORIGINS=https://app.ovoky.io,https://ovoky.io

# Optional: Sentry, logging, etc.
NODE_ENV=production
```

### 5. Configure Custom Domain

In Vercel Dashboard:

1. Go to your CDR API project
2. Navigate to **Settings** → **Domains**
3. Add domain: `cdrs.ovoky.io`
4. Configure DNS in your domain provider:
   ```
   Type: CNAME
   Name: cdrs
   Value: cname.vercel-dns.com
   TTL: 3600 (or Auto)
   ```
5. Wait for SSL certificate (automatic, ~1-2 minutes)
6. Verify: `https://cdrs.ovoky.io/health` should return `{"status":"ok"}`

### 6. Update OVO App Environment Variables

In the **OVO App** Vercel project, update:

```bash
# Production
CDR_API_URL=https://cdrs.ovoky.io
CDR_API_SECRET=your-secure-api-secret

# Preview/Development (optional)
CDR_API_URL_PREVIEW=https://cdr-api-preview.vercel.app
```

## 🔧 Fastify Serverless Adapter

Vercel requires a serverless function. Update `src/index.ts`:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { cdrsRoutes } from './routes/cdrs';
import { consumptionRoutes } from './routes/consumption';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// CORS configuration
await fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
});

// Register routes
await fastify.register(cdrsRoutes, { prefix: '/cdrs' });
await fastify.register(consumptionRoutes);

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Vercel serverless export
export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

// Local development
if (process.env.NODE_ENV !== 'production') {
  const start = async () => {
    try {
      const port = parseInt(process.env.PORT || '3002');
      const host = process.env.API_HOST || 'localhost';
      
      await fastify.listen({ port, host });
      console.log(`🚀 CDR API listening on http://${host}:${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  
  start();
}
```

## 🔐 Security Configuration

### 1. API Secret Authentication

The CDR API should verify the `Authorization` header:

```typescript
// In routes/cdrs.ts and routes/consumption.ts
fastify.addHook('onRequest', async (request, reply) => {
  const authHeader = request.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!process.env.CDR_API_SECRET || token !== process.env.CDR_API_SECRET) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});
```

### 2. CORS Configuration

Ensure only your OVO app can access the API:

```typescript
await fastify.register(cors, {
  origin: [
    'https://app.ovoky.io',
    'https://ovoky.io',
    /\.vercel\.app$/, // Allow Vercel preview deployments
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
});
```

### 3. Rate Limiting (Optional)

```bash
npm install @fastify/rate-limit
```

```typescript
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100, // 100 requests
  timeWindow: '1 minute',
});
```

## 📊 Environment-Specific Configuration

### Development
```bash
CDR_API_URL=http://localhost:3002
CDR_API_SECRET=dev-secret
```

### Preview (Vercel)
```bash
CDR_API_URL=https://cdr-api-git-preview-yourteam.vercel.app
CDR_API_SECRET=preview-secret
```

### Production
```bash
CDR_API_URL=https://cdrs.ovoky.io
CDR_API_SECRET=prod-secure-secret-here
```

## 🧪 Testing Deployment

### 1. Test Health Endpoint
```bash
curl https://cdrs.ovoky.io/health
# Expected: {"status":"ok","timestamp":"2025-11-22T..."}
```

### 2. Test CDR Endpoint
```bash
curl -X GET "https://cdrs.ovoky.io/cdrs?i_account=14&limit=10" \
  -H "Authorization: Bearer YOUR_CDR_API_SECRET"
```

### 3. Test Consumption Endpoint
```bash
curl -X GET "https://cdrs.ovoky.io/consumption?i_account=14&start_date=2025-11-01%2000:00:00&end_date=2025-11-21%2023:59:59" \
  -H "Authorization: Bearer YOUR_CDR_API_SECRET"
```

### 4. Test from OVO App
```bash
# In OVO app, trigger a CDR fetch
# Check browser Network tab for requests to cdrs.ovoky.io
# Verify 200 OK responses
```

## 📈 Monitoring

### Vercel Dashboard

1. **Functions**: View execution logs
2. **Analytics**: Track request counts, response times
3. **Logs**: Real-time logging with filters

### Key Metrics to Monitor

- **Response Time**: Should be < 2s for most queries
- **Error Rate**: Should be < 1%
- **Request Count**: Track usage patterns
- **Database Connections**: Monitor pool usage

## 🔄 Continuous Deployment

### Automatic Deployments

Vercel automatically deploys on:
- **Push to `main`**: Production deployment → `https://cdrs.ovoky.io`
- **Push to other branches**: Preview deployment
- **Pull requests**: Preview deployment with unique URL

### Manual Deployment

```bash
# Deploy to production
vercel --prod

# Deploy to preview
vercel
```

## 🐛 Troubleshooting

### Issue: CORS Errors

**Symptom**: Browser shows "CORS policy" error

**Solution**:
1. Check `ALLOWED_ORIGINS` in CDR API environment variables
2. Ensure `https://app.ovoky.io` is included
3. Redeploy CDR API after changes

### Issue: 401 Unauthorized

**Symptom**: All requests return 401

**Solution**:
1. Verify `CDR_API_SECRET` matches in both projects
2. Check `Authorization` header is being sent
3. Verify Bearer token format: `Bearer YOUR_SECRET`

### Issue: Timeout Errors

**Symptom**: Requests timeout after 10s

**Solution**:
1. Add function timeout configuration in `vercel.json`:
```json
{
  "functions": {
    "src/index.ts": {
      "maxDuration": 300
    }
  }
}
```
2. Optimize database queries (add indexes)
3. Consider pagination for large datasets

### Issue: Database Connection Errors

**Symptom**: "Connection refused" or "SSL required"

**Solution**:
1. Verify `POSTGRES_HOST` is accessible from Vercel
2. Enable SSL: `POSTGRES_SSL=true`
3. Check firewall rules allow Vercel IPs
4. Use connection pooling (already configured in `db.ts`)

### Issue: DNS Not Resolving

**Symptom**: `cdrs.ovoky.io` doesn't resolve

**Solution**:
1. Verify CNAME record: `dig cdrs.ovoky.io CNAME`
2. Wait for DNS propagation (up to 48 hours, usually < 1 hour)
3. Check Vercel domain status in dashboard
4. Try flushing local DNS cache: `sudo dscacheutil -flushcache` (macOS)

## 📚 Related Files

- **Main Entry**: `src/index.ts`
- **Database**: `src/db.ts`
- **CDR Routes**: `src/routes/cdrs.ts`
- **Consumption Routes**: `src/routes/consumption.ts`
- **Types**: `src/types.ts`
- **Environment**: `.env` (local), Vercel Dashboard (production)

## ✅ Deployment Checklist

Before going to production:

- [ ] Create `vercel.json` in cdr-api directory
- [ ] Update `src/index.ts` with serverless export
- [ ] Set all environment variables in Vercel
- [ ] Configure custom domain `cdrs.ovoky.io`
- [ ] Update DNS CNAME record: `cdrs → cname.vercel-dns.com`
- [ ] Wait for SSL certificate provisioning
- [ ] Test health endpoint: `https://cdrs.ovoky.io/health`
- [ ] Test CDR endpoint with authentication
- [ ] Test consumption endpoint
- [ ] Update OVO app `CDR_API_URL=https://cdrs.ovoky.io`
- [ ] Update OVO app `ALLOWED_ORIGINS` to include `https://cdrs.ovoky.io`
- [ ] Test from OVO app (CDR reports, dashboard widgets)
- [ ] Monitor logs for errors
- [ ] Set up alerts (optional)
- [ ] Document API secret securely

## 🎯 Success Criteria

After successful deployment:

- ✅ CDR API accessible at `https://cdrs.ovoky.io`
- ✅ Health endpoint returns 200 OK
- ✅ OVO app can fetch CDRs successfully
- ✅ Dashboard widgets load data
- ✅ Consumption history displays correctly
- ✅ No CORS errors in browser console
- ✅ Response times < 2s for typical queries
- ✅ SSL certificate valid (🔒 in browser)
- ✅ Logs show successful requests
- ✅ No authentication errors

## 🌐 DNS Configuration Example

```
# In your DNS provider (e.g., Cloudflare, Route53, etc.)
Type    Name    Value                   TTL
CNAME   cdrs    cname.vercel-dns.com    Auto
```

After adding, verify with:
```bash
dig cdrs.ovoky.io
# Should show CNAME pointing to Vercel
```

## 🔗 Useful Links

- [Vercel Documentation](https://vercel.com/docs)
- [Fastify on Vercel](https://vercel.com/guides/using-fastify-with-vercel)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)
- [Custom Domains](https://vercel.com/docs/concepts/projects/custom-domains)
- [DNS Configuration](https://vercel.com/docs/concepts/projects/domains/add-a-domain)

## 📝 Quick Reference

### Production URLs
- **Main App**: `https://app.ovoky.io` or `https://ovoky.io`
- **CDR API**: `https://cdrs.ovoky.io`

### Key Endpoints
- **Health**: `GET /health`
- **CDRs**: `GET /cdrs?i_account={id}&limit={n}`
- **Consumption**: `GET /consumption?i_account={id}&start_date={date}&end_date={date}`

### Authentication
All requests require:
```
Authorization: Bearer YOUR_CDR_API_SECRET
```
