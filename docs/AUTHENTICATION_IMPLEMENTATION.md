# CDR API Authentication Implementation

## Overview

This document describes the authentication system implemented for the CDR API to secure all endpoints.

## Architecture

### Authentication Flow

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│  OVO App    │                    │  CDR API    │                    │  Database   │
│             │                    │             │                    │             │
└──────┬──────┘                    └──────┬──────┘                    └──────┬──────┘
       │                                  │                                  │
       │  GET /cdrs                       │                                  │
       │  Authorization: Bearer <secret>  │                                  │
       ├─────────────────────────────────>│                                  │
       │                                  │                                  │
       │                                  │  authenticateRequest()           │
       │                                  │  - Check Authorization header    │
       │                                  │  - Validate API_SECRET           │
       │                                  │                                  │
       │                                  │  ✓ Auth Success                  │
       │                                  │                                  │
       │                                  │  Query CDRs                      │
       │                                  ├─────────────────────────────────>│
       │                                  │                                  │
       │                                  │  Return Results                  │
       │                                  │<─────────────────────────────────┤
       │                                  │                                  │
       │  200 OK + CDR Data               │                                  │
       │<─────────────────────────────────┤                                  │
       │                                  │                                  │
```

### Without Valid Token

```
┌─────────────┐                    ┌─────────────┐
│  Client     │                    │  CDR API    │
│             │                    │             │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  GET /cdrs                       │
       │  (no Authorization header)       │
       ├─────────────────────────────────>│
       │                                  │
       │                                  │  authenticateRequest()
       │                                  │  - Missing header
       │                                  │  ✗ Auth Failed
       │                                  │
       │  401 Unauthorized                │
       │<─────────────────────────────────┤
       │                                  │
```

## Implementation Details

### 1. Authentication Middleware (`src/middleware/auth.ts`)

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

const API_SECRET = process.env.API_SECRET;

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip auth if no API_SECRET is configured (development only)
  if (!API_SECRET) {
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

  if (token !== API_SECRET) {
    console.error('❌ Authentication failed: Invalid API secret');
    return reply.code(401).send({
      success: false,
      error: 'Unauthorized: Invalid API secret',
    });
  }

  console.log('✅ Request authenticated');
}
```

### 2. Protected Routes

All CDR API routes now use the `preHandler` hook to enforce authentication:

```typescript
// Example: GET /cdrs
fastify.get<{ Querystring: CDRQuerystring }>(
  '/cdrs',
  {
    preHandler: authenticateRequest,  // ← Authentication enforced here
  },
  async (request, reply) => {
    // Route handler only executes if authentication succeeds
    // ...
  }
);
```

### 3. Protected Endpoints

The following endpoints are now protected:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/cdrs` | GET | Fetch CDRs with filters |
| `/cdrs/stats` | GET | Get CDR statistics |
| `/cdrs/top-destinations` | GET | Get top destinations by cost |
| `/consumption` | GET | Fetch consumption data |
| `/replication-status` | GET | Check database replication status |

**Note:** The root endpoint `/` and `/health` remain public for monitoring purposes.

### 4. Client Implementation (OVO App)

The OVO App sends the API secret in all requests:

```typescript
// Example from ovo/src/app/api/cdr-proxy/route.ts
const headers: HeadersInit = {
  'Content-Type': 'application/json',
};

if (CDR_API_SECRET) {
  headers['Authorization'] = `Bearer ${CDR_API_SECRET}`;
}

const response = await fetch(cdrApiUrl, {
  method: 'GET',
  headers,
  signal: AbortSignal.timeout(60000),
});
```

## Configuration

### Environment Variables

#### CDR API

```bash
# .env or .env.production
API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

#### OVO App

```bash
# .env.local or .env.production
CDR_API_URL=http://localhost:3002  # or https://cdrs.ovoky.io
CDR_API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

### Generating a New Secret

```bash
openssl rand -base64 32
```

## Security Features

### 1. Bearer Token Authentication
- Standard HTTP Authorization header format
- Easy to implement across different clients
- Compatible with API gateways and proxies

### 2. Environment-Based Configuration
- Secrets stored in environment variables (not in code)
- Different secrets can be used for dev/staging/production
- Easy to rotate without code changes

### 3. Request Logging
- All authentication attempts are logged
- Failed attempts include reason (missing header vs invalid secret)
- Successful authentications are logged for audit trail

### 4. Development Mode Warning
- If `API_SECRET` is not set, a warning is logged on every request
- Helps developers identify misconfiguration
- Should never occur in production

## Error Responses

### 401 Unauthorized - Missing Header

```json
{
  "success": false,
  "error": "Unauthorized: Missing Authorization header"
}
```

**Cause:** Request did not include `Authorization` header

**Solution:** Add `Authorization: Bearer <secret>` header to request

### 401 Unauthorized - Invalid Secret

```json
{
  "success": false,
  "error": "Unauthorized: Invalid API secret"
}
```

**Cause:** Token in Authorization header does not match `API_SECRET`

**Solution:** Verify `CDR_API_SECRET` in OVO App matches `API_SECRET` in CDR API

## Testing

### Manual Testing with curl

#### Test without authentication (should fail)
```bash
curl -X GET "http://localhost:3002/cdrs?i_account=123"
```

Expected response:
```json
{
  "success": false,
  "error": "Unauthorized: Missing Authorization header"
}
```

#### Test with wrong secret (should fail)
```bash
curl -X GET "http://localhost:3002/cdrs?i_account=123" \
  -H "Authorization: Bearer wrong-secret"
```

Expected response:
```json
{
  "success": false,
  "error": "Unauthorized: Invalid API secret"
}
```

#### Test with correct secret (should succeed)
```bash
curl -X GET "http://localhost:3002/cdrs?i_account=123" \
  -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
```

Expected response:
```json
{
  "success": true,
  "data": [...],
  ...
}
```

### Automated Testing

Create a test script (`test-auth.sh`):

```bash
#!/bin/bash

API_URL="http://localhost:3002"
API_SECRET="7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="

echo "Testing CDR API Authentication..."
echo

# Test 1: No auth header (should fail)
echo "Test 1: Request without authentication"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/cdrs?i_account=123")
if [ "$STATUS" = "401" ]; then
  echo "✅ PASS: Correctly rejected unauthorized request"
else
  echo "❌ FAIL: Expected 401, got $STATUS"
fi
echo

# Test 2: Wrong secret (should fail)
echo "Test 2: Request with invalid secret"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer wrong-secret" \
  "$API_URL/cdrs?i_account=123")
if [ "$STATUS" = "401" ]; then
  echo "✅ PASS: Correctly rejected invalid secret"
else
  echo "❌ FAIL: Expected 401, got $STATUS"
fi
echo

# Test 3: Correct secret (should succeed)
echo "Test 3: Request with valid secret"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_SECRET" \
  "$API_URL/cdrs?i_account=123")
if [ "$STATUS" = "200" ]; then
  echo "✅ PASS: Successfully authenticated"
else
  echo "❌ FAIL: Expected 200, got $STATUS"
fi
```

## Deployment Checklist

Before deploying to production:

- [ ] Generate a strong API secret using `openssl rand -base64 32`
- [ ] Set `API_SECRET` in CDR API environment
- [ ] Set `CDR_API_SECRET` in OVO App environment
- [ ] Verify both secrets match exactly (no extra spaces/newlines)
- [ ] Build CDR API: `npm run build`
- [ ] Restart CDR API: `pm2 restart cdr-api`
- [ ] Build OVO App: `npm run build`
- [ ] Restart OVO App: `pm2 restart ovo`
- [ ] Test authentication with curl (see Testing section)
- [ ] Verify OVO App can fetch CDRs successfully
- [ ] Check logs for authentication success messages
- [ ] Monitor for any 401 errors in application logs
- [ ] Remove development URLs from `ALLOWED_ORIGINS`
- [ ] Document the secret in your password manager

## Troubleshooting

### Issue: OVO App returns "CDR API error: Unauthorized"

**Cause:** `CDR_API_SECRET` is not set or doesn't match `API_SECRET`

**Solution:**
1. Check OVO App environment: `echo $CDR_API_SECRET`
2. Check CDR API environment: `echo $API_SECRET`
3. Ensure they match exactly
4. Restart both services after updating

### Issue: CDR API logs "API_SECRET not configured" warning

**Cause:** `API_SECRET` environment variable is not set

**Solution:**
1. Add `API_SECRET=<your-secret>` to `.env` file
2. Restart CDR API
3. Verify with: `pm2 logs cdr-api | grep API_SECRET`

### Issue: Authentication works locally but fails in production

**Cause:** Environment variables not loaded in production

**Solution:**
1. Check production `.env` file exists
2. Verify PM2 is loading environment: `pm2 env <process-id>`
3. Ensure ecosystem.config.js includes env_file
4. Restart with: `pm2 restart cdr-api --update-env`

## Best Practices

1. **Never commit secrets to git**
   - Use `.env` files (already in `.gitignore`)
   - Use environment variables in CI/CD
   - Store secrets in password manager

2. **Use different secrets for different environments**
   - Development: One secret
   - Staging: Different secret
   - Production: Different secret

3. **Rotate secrets periodically**
   - Generate new secret
   - Update both services simultaneously
   - Test before rolling back old secret

4. **Monitor authentication failures**
   - Set up alerts for repeated 401 errors
   - Could indicate attack or misconfiguration
   - Review logs regularly

5. **Use HTTPS in production**
   - Bearer tokens are sent in plain text
   - HTTPS encrypts the entire request
   - Never use HTTP for production API

## Future Enhancements

Potential improvements to consider:

1. **JWT Tokens**
   - Replace static secret with time-limited JWTs
   - Include user/account information in token
   - Automatic expiration and refresh

2. **Rate Limiting**
   - Limit requests per API key
   - Prevent brute force attacks
   - Protect against DDoS

3. **API Key Management**
   - Multiple API keys per client
   - Ability to revoke individual keys
   - Usage tracking per key

4. **IP Whitelisting**
   - Additional layer of security
   - Only allow requests from known IPs
   - Useful for server-to-server communication

5. **Request Signing**
   - Sign requests with HMAC
   - Prevent replay attacks
   - Ensure request integrity

## References

- [Fastify Authentication](https://www.fastify.io/docs/latest/Reference/Hooks/#prehandler)
- [HTTP Bearer Authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication)
- [OWASP API Security](https://owasp.org/www-project-api-security/)

