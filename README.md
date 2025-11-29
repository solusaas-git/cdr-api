# CDR API v2.0.0 - High-Performance PostgreSQL Replica API

A production-ready API server for querying CDR (Call Detail Records) from a PostgreSQL replica database. **VPS-hosted** with advanced protection features.

## ✨ Features

### Performance & Reliability
- ⚡ **Fast**: Built with Fastify for maximum performance
- 🔄 **Replica-Safe**: Automatic handling of replica startup delays
- 🛡️ **Circuit Breaker**: Netflix Hystrix-style protection
- 📊 **Request Queue**: Automatic queuing during database issues
- 🏥 **Health Monitoring**: Continuous database health checks
- 🔄 **Auto Recovery**: Automatic recovery from database failures

### Security & Scalability
- 🔒 **Secure**: Bearer token authentication, CORS protection
- 📈 **Scalable**: Connection pooling and optimized queries
- 🎯 **Production-Ready**: Zero downtime deployments
- 📝 **Well-Documented**: Comprehensive guides

## 🏗️ Architecture

```
Client Request → Fastify API → safeQuery → Queue/Circuit Breaker → PostgreSQL Replica
                                                ↓
                                         Health Monitor (2s checks)
```

## 🚀 Quick Start

## Prerequisites

- Node.js 18+ or 20+
- PostgreSQL 16 replica configured and running
- Access to Sippy CDR database schema

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

## Configuration

Edit `.env` file:

```env
# PostgreSQL Replica Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sippy
DB_USER=replicator
DB_PASSWORD=your_secure_password
DB_MAX_CONNECTIONS=20

# API Configuration
API_PORT=3001
API_HOST=0.0.0.0

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

# Authentication (REQUIRED for production)
# Generate with: openssl rand -base64 32
API_SECRET=your-secure-api-secret-here
```

**⚠️ IMPORTANT:** The `API_SECRET` must match the `CDR_API_SECRET` in your Next.js application.

## Development

```bash
# Run in development mode with hot reload
npm run dev
```

## Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

## API Endpoints

**🔐 Authentication Required:** All endpoints (except `/health`) require a Bearer token in the Authorization header.

### GET /cdrs

Fetch CDRs with filters.

**Headers:**
- `Authorization: Bearer <API_SECRET>` (required)

**Query Parameters:**
- `i_account` (required): Account ID
- `type`: Filter type (`all`, `non_zero`, `non_zero_and_errors`, `complete`, `incomplete`, `errors`)
- `start_date`: Start date (ISO format)
- `end_date`: End date (ISO format)
- `cli`: Calling number filter
- `cld`: Called number filter
- `limit`: Max records (default: 500, max: 100000)
- `offset`: Pagination offset (default: 0)

**Example:**
```bash
curl "http://localhost:3001/cdrs?i_account=14&limit=1000&offset=0&type=non_zero_and_errors" \
  -H "Authorization: Bearer your-api-secret-here"
```

### GET /cdrs/stats

Get aggregated CDR statistics (faster than fetching all records).

**Headers:**
- `Authorization: Bearer <API_SECRET>` (required)

**Query Parameters:**
- `i_account` (required): Account ID
- `start_date`: Start date (ISO format)
- `end_date`: End date (ISO format)

**Example:**
```bash
curl "http://localhost:3001/cdrs/stats?i_account=14" \
  -H "Authorization: Bearer your-api-secret-here"
```

### GET /health

Health check endpoint.

## Performance Tips

1. **Indexing**: Ensure your CDR table has indexes on:
   - `i_account`
   - `connect_time`
   - `disconnect_cause`
   - Composite index on `(i_account, connect_time)`

2. **Connection Pooling**: Adjust `DB_MAX_CONNECTIONS` based on your server resources

3. **Batch Requests**: Use pagination with reasonable limits (25K-50K records per request)

4. **Caching**: Consider implementing Redis caching for frequently accessed data

## Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the API
pm2 start dist/index.js --name cdr-api

# Save PM2 configuration
pm2 save

# Setup auto-start on boot
pm2 startup
```

### Using systemd

Create `/etc/systemd/system/cdr-api.service`:

```ini
[Unit]
Description=CDR API Service
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/cdr-api
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable cdr-api
sudo systemctl start cdr-api
sudo systemctl status cdr-api
```

## Monitoring

Check logs:

```bash
# PM2 logs
pm2 logs cdr-api

# systemd logs
sudo journalctl -u cdr-api -f
```

## Security

### Authentication

All API endpoints (except `/health`) are protected with Bearer token authentication.

**Setup:**

1. Generate a secure API secret:
   ```bash
   openssl rand -base64 32
   ```

2. Set the secret in CDR API `.env`:
   ```env
   API_SECRET=your-generated-secret
   ```

3. Set the same secret in your Next.js app `.env`:
   ```env
   CDR_API_SECRET=your-generated-secret
   ```

4. Test authentication:
   ```bash
   ./test-auth.sh
   ```

**See also:**
- [SECURITY_FIX.md](./SECURITY_FIX.md) - Details about the security implementation
- [AUTHENTICATION_IMPLEMENTATION.md](./AUTHENTICATION_IMPLEMENTATION.md) - Complete authentication guide

### Additional Security Measures

1. **Firewall**: Only allow connections from your Next.js server
2. **Rate Limiting**: Consider implementing rate limiting for production use
3. **SSL/TLS**: Use HTTPS in production (reverse proxy with Nginx)
4. **IP Whitelisting**: Restrict access to known IP addresses

## Troubleshooting

### Connection Issues

```bash
# Test database connection
psql -h localhost -U replicator -d sippy -c "SELECT version();"

# Check replication status
psql -h localhost -U replicator -d sippy -c "SELECT * FROM pg_stat_wal_receiver;"
```

### Performance Issues

- Check PostgreSQL logs for slow queries
- Monitor connection pool usage
- Verify indexes exist on CDR table
- Consider increasing `DB_MAX_CONNECTIONS`

## License

MIT

