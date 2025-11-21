# 🚀 CDR API - Pre-Launch Checklist

## 📋 Overview

This checklist ensures the CDR API is ready for production deployment on `cdrs.ovoky.io`.

---

## ✅ Code & Configuration

### Repository Setup
- [x] `.gitignore` created and configured
- [ ] `.env` file NOT committed to Git (verify with `git status`)
- [ ] Code committed to Git repository
- [ ] Repository pushed to GitHub/GitLab

### Environment Files
- [x] `.env` file configured with production values
- [x] API_SECRET generated (secure 64-char string)
- [x] Database credentials configured
- [x] CORS origins updated (`app.ovoky.io`, `ovoky.io`)
- [ ] Create `.env.example` for documentation (optional)

### Code Quality
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] No linter errors
- [ ] All routes tested locally
- [ ] Database connection tested

---

## 🗄️ Database

### PostgreSQL Setup
- [x] PostgreSQL replica accessible
- [x] Database credentials valid
- [x] SSL enabled for production
- [x] Connection pooling configured (max 20 connections)

### Indexes (Critical for Performance!)
- [ ] Verify indexes exist on PostgreSQL:
  ```sql
  -- Run on PostgreSQL:
  SELECT tablename, indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename LIKE 'cdrs%' 
  ORDER BY tablename, indexname;
  ```
- [ ] Required indexes:
  - [ ] `idx_cdrs_account_connect_time` (i_account, connect_time DESC)
  - [ ] `idx_cdrs_account_result_duration` (i_account, result, duration)
  - [ ] `idx_cdrs_connect_time` (connect_time DESC)

### Test Queries
- [ ] Test CDR query: `SELECT * FROM cdrs WHERE i_account = 14 LIMIT 10;`
- [ ] Test consumption query with date range
- [ ] Verify query performance (< 2 seconds)

---

## ☁️ Vercel Deployment

### Project Setup
- [ ] Vercel account created/logged in
- [ ] Vercel CLI installed: `npm i -g vercel`
- [ ] Project initialized: `vercel` (in cdr-api directory)

### Configuration Files
- [ ] `vercel.json` created with:
  - [ ] Serverless function configuration
  - [ ] Routes configuration
  - [ ] Region set to `iad1` (or closest to database)
  - [ ] Function timeout set to 300s

### Environment Variables (Vercel Dashboard)
Set these in Vercel Project Settings → Environment Variables:

**Database:**
- [ ] `POSTGRES_HOST` = `88.99.195.187`
- [ ] `POSTGRES_PORT` = `5432`
- [ ] `POSTGRES_DATABASE` = `sippy`
- [ ] `POSTGRES_USER` = `replica_monitor`
- [ ] `POSTGRES_PASSWORD` = `[your-password]`
- [ ] `POSTGRES_SSL` = `true`

**API Configuration:**
- [ ] `CDR_API_SECRET` = `7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=`
- [ ] `ALLOWED_ORIGINS` = `https://app.ovoky.io,https://ovoky.io`
- [ ] `NODE_ENV` = `production`

**Optional:**
- [ ] `LOG_LEVEL` = `info`

### Domain Configuration
- [ ] Custom domain added: `cdrs.ovoky.io`
- [ ] DNS CNAME record created:
  ```
  Type: CNAME
  Name: cdrs
  Value: cname.vercel-dns.com
  TTL: 3600
  ```
- [ ] SSL certificate provisioned (automatic by Vercel)
- [ ] Domain status shows "Valid" in Vercel dashboard

---

## 🔐 Security

### API Authentication
- [x] API_SECRET generated (secure random string)
- [ ] Same secret set in both CDR API and OVO App
- [ ] Bearer token authentication implemented
- [ ] Unauthorized requests return 401

### CORS Configuration
- [x] CORS origins configured
- [ ] Only production domains allowed
- [ ] Credentials enabled
- [ ] Preflight requests handled

### Network Security
- [ ] PostgreSQL accessible from Vercel IPs
- [ ] Firewall rules configured (if applicable)
- [ ] SSL/TLS enabled for database connection

---

## 🧪 Testing

### Local Testing
- [ ] Start local server: `npm run dev`
- [ ] Test health endpoint: `curl http://localhost:3002/health`
- [ ] Test CDR endpoint with Bearer token
- [ ] Test consumption endpoint
- [ ] Verify CORS headers

### Production Testing (After Deployment)
- [ ] Health check: `curl https://cdrs.ovoky.io/health`
  - Expected: `{"status":"ok","timestamp":"..."}`
- [ ] CDR endpoint:
  ```bash
  curl -X GET "https://cdrs.ovoky.io/cdrs?i_account=14&limit=10" \
    -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
  ```
  - Expected: JSON with CDR records
- [ ] Consumption endpoint:
  ```bash
  curl -X GET "https://cdrs.ovoky.io/consumption?i_account=14&start_date=2025-11-01%2000:00:00&end_date=2025-11-21%2023:59:59" \
    -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
  ```
  - Expected: JSON with consumption data
- [ ] Test without Bearer token (should return 401)
- [ ] Test with wrong Bearer token (should return 401)
- [ ] Test CORS from browser console

---

## 🔗 OVO App Integration

### Environment Variables (OVO App)
Update in Vercel Dashboard → OVO App Project:

- [ ] `CDR_API_URL` = `https://cdrs.ovoky.io`
- [ ] `CDR_API_SECRET` = `7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=`

### Code Updates
- [ ] All API calls use `CDR_API_URL` from environment
- [ ] All requests include `Authorization: Bearer ${CDR_API_SECRET}`
- [ ] Error handling for CDR API failures

### Testing from OVO App
- [ ] CDR Reports page loads data
- [ ] Dashboard widgets display correctly
- [ ] Consumption History widget works
- [ ] "Refresh" button updates today's data
- [ ] No CORS errors in browser console
- [ ] No authentication errors

---

## 📊 Monitoring & Logging

### Vercel Dashboard
- [ ] Access Vercel Functions logs
- [ ] Monitor request counts
- [ ] Check error rates
- [ ] Review response times

### Key Metrics
- [ ] Response time < 2s for typical queries
- [ ] Error rate < 1%
- [ ] Database connection pool healthy
- [ ] No timeout errors

### Alerts (Optional)
- [ ] Set up error rate alerts
- [ ] Set up response time alerts
- [ ] Set up uptime monitoring

---

## 📚 Documentation

### Internal Documentation
- [x] `VERCEL_DEPLOYMENT.md` created
- [x] `PRE_LAUNCH_CHECKLIST.md` created (this file)
- [ ] API endpoints documented
- [ ] Environment variables documented

### Team Communication
- [ ] Share CDR API URL with team
- [ ] Share API secret securely (password manager)
- [ ] Document deployment process
- [ ] Create runbook for common issues

---

## 🚨 Rollback Plan

### If Something Goes Wrong
1. **Revert Vercel deployment**: Use Vercel dashboard to rollback
2. **Switch OVO App back to old API**: Update `CDR_API_URL`
3. **Check logs**: Identify the issue
4. **Fix and redeploy**: Address the problem and try again

### Emergency Contacts
- [ ] Document who to contact for:
  - [ ] Database issues
  - [ ] Vercel issues
  - [ ] DNS issues

---

## ✅ Final Checks Before Launch

### Pre-Deployment
- [ ] All items above completed
- [ ] Code reviewed
- [ ] Tests passing
- [ ] Database accessible
- [ ] Environment variables set

### Deployment
- [ ] Run: `vercel --prod`
- [ ] Deployment successful
- [ ] Domain accessible
- [ ] SSL certificate valid

### Post-Deployment
- [ ] Health check passes
- [ ] API endpoints respond correctly
- [ ] OVO App integration works
- [ ] Monitor logs for 30 minutes
- [ ] No errors reported

### Communication
- [ ] Notify team of successful deployment
- [ ] Update documentation with production URLs
- [ ] Share monitoring dashboard access

---

## 🎯 Success Criteria

Your CDR API is ready for production when:

- ✅ All checklist items completed
- ✅ `https://cdrs.ovoky.io/health` returns 200 OK
- ✅ CDR queries return data in < 2 seconds
- ✅ OVO App successfully fetches CDRs
- ✅ Dashboard widgets display data
- ✅ No CORS or authentication errors
- ✅ SSL certificate valid (🔒 in browser)
- ✅ Logs show successful requests
- ✅ Team notified and ready

---

## 📞 Support Resources

### Documentation
- Vercel Docs: https://vercel.com/docs
- Fastify Docs: https://www.fastify.io/docs/latest/
- PostgreSQL Docs: https://www.postgresql.org/docs/

### Internal Docs
- `docs/VERCEL_DEPLOYMENT.md` - Deployment guide
- `docs/ARCHITECTURE.md` - System architecture
- `.env.example` - Environment variables reference

### Troubleshooting
- Check Vercel function logs
- Review PostgreSQL slow query log
- Test with `curl` commands
- Check DNS propagation: `dig cdrs.ovoky.io`

---

## 🎉 Launch Day Checklist

**Morning of Launch:**
1. [ ] Verify database is accessible
2. [ ] Check Vercel status page
3. [ ] Review recent logs for any issues
4. [ ] Ensure team is available for support

**During Launch:**
1. [ ] Deploy to production: `vercel --prod`
2. [ ] Verify health endpoint
3. [ ] Test all API endpoints
4. [ ] Update OVO App environment variables
5. [ ] Deploy OVO App
6. [ ] Test end-to-end flow
7. [ ] Monitor logs actively

**After Launch:**
1. [ ] Monitor for 1 hour
2. [ ] Check error rates
3. [ ] Verify performance metrics
4. [ ] Document any issues
5. [ ] Celebrate! 🎉

---

## 📝 Notes

- Keep this checklist updated as you complete items
- Mark items with `[x]` when completed
- Add notes below for any issues or observations

### Launch Notes:
```
Date: _______________
Deployed by: _______________
Issues encountered: _______________
Resolution: _______________
```

---

**Ready to launch?** Complete all items above, then run: `vercel --prod` 🚀

