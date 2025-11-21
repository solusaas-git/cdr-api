# Security Fix: API Authentication

## Critical Issue Found

The CDR API was **completely unsecured** - all endpoints were accessible without any authentication. Anyone who knew the API URL could query all CDR data.

## What Was Fixed

### 1. Added Authentication Middleware
Created `/src/middleware/auth.ts` that:
- Validates the `Authorization: Bearer <token>` header on all requests
- Compares the token against the `API_SECRET` environment variable
- Returns 401 Unauthorized if authentication fails
- Logs authentication attempts for security monitoring

### 2. Protected All Endpoints
Added authentication to all CDR API endpoints:
- `GET /cdrs` - Fetch CDRs with filters
- `GET /cdrs/stats` - Get CDR statistics
- `GET /cdrs/top-destinations` - Get top destinations
- `GET /consumption` - Fetch consumption data
- `GET /replication-status` - Check replication status

### 3. Updated Environment Configuration

**CDR API (.env):**
```bash
API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

**OVO App (.env.local and .env.production):**
```bash
CDR_API_URL=http://localhost:3002  # or https://cdrs.ovoky.io for production
CDR_API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

**IMPORTANT:** The `API_SECRET` in CDR API must match `CDR_API_SECRET` in OVO App.

## How It Works

1. **OVO App** makes a request to CDR API with the secret in the Authorization header:
   ```typescript
   const headers: HeadersInit = {
     'Content-Type': 'application/json',
   };
   
   if (CDR_API_SECRET) {
     headers['Authorization'] = `Bearer ${CDR_API_SECRET}`;
   }
   ```

2. **CDR API** validates the token in the `authenticateRequest` middleware:
   ```typescript
   const authHeader = request.headers.authorization;
   const token = authHeader.replace('Bearer ', '');
   
   if (token !== API_SECRET) {
     return reply.code(401).send({
       success: false,
       error: 'Unauthorized: Invalid API secret',
     });
   }
   ```

3. If validation passes, the request proceeds to the route handler.

## Security Considerations

### Development Mode Warning
If `API_SECRET` is not configured, the middleware logs a warning but allows the request:
```
⚠️  WARNING: API_SECRET not configured - API is UNSECURED!
```

**This is for development convenience only. NEVER deploy to production without API_SECRET configured.**

### Production Deployment Checklist

Before deploying to production:

- [ ] Ensure `API_SECRET` is set in CDR API environment
- [ ] Ensure `CDR_API_SECRET` is set in OVO App environment
- [ ] Verify both secrets match exactly
- [ ] Test authentication by making a request without the secret (should return 401)
- [ ] Test authentication by making a request with wrong secret (should return 401)
- [ ] Test authentication by making a request with correct secret (should return 200)
- [ ] Remove any localhost URLs from `ALLOWED_ORIGINS` in production
- [ ] Monitor logs for unauthorized access attempts

### Rotating the Secret

To rotate the API secret:

1. Generate a new secret:
   ```bash
   openssl rand -base64 32
   ```

2. Update both environments:
   - CDR API: `API_SECRET=<new-secret>`
   - OVO App: `CDR_API_SECRET=<new-secret>`

3. Restart both services simultaneously to avoid downtime

4. Verify the new secret works by testing API requests

## Testing Authentication

### Test Unauthorized Access (should fail)
```bash
curl -X GET "http://localhost:3002/cdrs?i_account=123"
# Expected: 401 Unauthorized
```

### Test with Invalid Secret (should fail)
```bash
curl -X GET "http://localhost:3002/cdrs?i_account=123" \
  -H "Authorization: Bearer wrong-secret"
# Expected: 401 Unauthorized
```

### Test with Valid Secret (should succeed)
```bash
curl -X GET "http://localhost:3002/cdrs?i_account=123" \
  -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
# Expected: 200 OK with CDR data
```

## Impact

- **Before:** Anyone could access all CDR data without authentication
- **After:** All requests require a valid API secret in the Authorization header
- **Breaking Change:** Existing integrations without the secret will receive 401 errors

## Deployment Steps

1. **Update CDR API:**
   ```bash
   cd cdr-api
   # Ensure API_SECRET is in .env
   npm run build
   pm2 restart cdr-api
   ```

2. **Update OVO App:**
   ```bash
   cd ovo
   # Ensure CDR_API_SECRET is in .env.production
   npm run build
   pm2 restart ovo
   ```

3. **Verify:**
   - Check CDR API logs for authentication messages
   - Test CDR fetching in OVO App
   - Monitor for any 401 errors

## Monitoring

Watch for these log messages:

**Success:**
```
✅ Request authenticated
```

**Failure:**
```
❌ Authentication failed: No Authorization header
❌ Authentication failed: Invalid API secret
```

**Warning (development only):**
```
⚠️  WARNING: API_SECRET not configured - API is UNSECURED!
```

## Questions?

If you encounter issues:
1. Verify both secrets are set and match exactly
2. Check for whitespace or encoding issues in the secret
3. Ensure the Authorization header format is correct: `Bearer <secret>`
4. Check CDR API logs for authentication error messages

