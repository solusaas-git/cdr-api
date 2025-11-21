# 🚀 Deploy CDR API to Vercel - Quick Guide

## ✅ Pre-Deployment Checklist

All configuration files are ready:
- [x] `vercel.json` - Vercel configuration
- [x] `src/index.ts` - Updated for serverless
- [x] `package.json` - Vercel build scripts added
- [x] `.gitignore` - Secrets protected
- [x] `.env.example` - Documentation
- [x] API_SECRET generated

## 📦 Step 1: Commit to Git

```bash
cd /Users/macbook/Documents/projects/sipp/cdr-api

# Check status (verify .env is NOT listed)
git status

# Add files
git add .
git commit -m "feat: Add Vercel serverless configuration for CDR API"

# Push to your repository
git push origin main
```

## ☁️ Step 2: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview first (test deployment)
vercel

# If preview works, deploy to production
vercel --prod
```

### Option B: Using Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your Git repository
3. Vercel will auto-detect the project
4. Click "Deploy"

## 🔐 Step 3: Set Environment Variables

In Vercel Dashboard → Your CDR API Project → Settings → Environment Variables:

Add these variables for **Production**:

```bash
# Database
POSTGRES_HOST=88.99.195.187
POSTGRES_PORT=5432
POSTGRES_DATABASE=sippy
POSTGRES_USER=replica_monitor
POSTGRES_PASSWORD=q8uScn$72*xPsR#t
POSTGRES_SSL=true

# API
CDR_API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
ALLOWED_ORIGINS=https://app.ovoky.io,https://ovoky.io
NODE_ENV=production
```

**Important**: After adding variables, **redeploy** the project!

## 🌐 Step 4: Configure Custom Domain

1. In Vercel Dashboard → Your CDR API Project → Settings → Domains
2. Click "Add Domain"
3. Enter: `cdrs.ovoky.io`
4. Vercel will provide DNS instructions

### Configure DNS (in your domain provider):

```
Type: CNAME
Name: cdrs
Value: cname.vercel-dns.com
TTL: 3600 (or Auto)
```

5. Wait for DNS propagation (1-5 minutes usually)
6. Vercel will automatically provision SSL certificate

## 🧪 Step 5: Test Deployment

### Test Health Endpoint
```bash
curl https://cdrs.ovoky.io/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-22T...",
  "environment": "vercel"
}
```

### Test CDR Endpoint
```bash
curl -X GET "https://cdrs.ovoky.io/cdrs?i_account=14&limit=10" \
  -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
```

Expected: JSON with CDR records

### Test Consumption Endpoint
```bash
curl -X GET "https://cdrs.ovoky.io/consumption?i_account=14&start_date=2025-11-01%2000:00:00&end_date=2025-11-21%2023:59:59" \
  -H "Authorization: Bearer 7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A="
```

Expected: JSON with consumption data

### Test Authentication
```bash
# Without token (should fail with 401)
curl https://cdrs.ovoky.io/cdrs?i_account=14&limit=10
```

Expected: `401 Unauthorized`

## 🔗 Step 6: Update OVO App

In Vercel Dashboard → OVO App Project → Settings → Environment Variables:

Update or add:
```bash
CDR_API_URL=https://cdrs.ovoky.io
CDR_API_SECRET=7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=
```

Then **redeploy** the OVO App!

## ✅ Step 7: Verify Integration

1. Open OVO App in browser
2. Navigate to CDR Reports page
3. Verify data loads correctly
4. Check Dashboard widgets
5. Test Consumption History widget
6. Open browser console - verify no CORS errors

## 📊 Step 8: Monitor

### Check Vercel Logs
1. Go to Vercel Dashboard
2. Select CDR API project
3. Click "Functions" tab
4. View real-time logs

### Key Metrics to Watch
- Response times (should be < 2s)
- Error rates (should be < 1%)
- Request counts
- Database connection status

## 🎉 Success Criteria

Your deployment is successful when:

- ✅ `https://cdrs.ovoky.io/health` returns 200 OK
- ✅ CDR endpoint returns data with Bearer token
- ✅ Returns 401 without Bearer token
- ✅ OVO App loads CDR data successfully
- ✅ Dashboard widgets display correctly
- ✅ No CORS errors in browser console
- ✅ SSL certificate shows 🔒 in browser
- ✅ Response times < 2 seconds

## 🐛 Troubleshooting

### Issue: "Function Timeout"
**Solution**: Verify `maxDuration: 300` is set in `vercel.json`

### Issue: "Database Connection Error"
**Solution**: 
1. Check environment variables in Vercel
2. Verify `POSTGRES_SSL=true`
3. Check database is accessible from Vercel IPs

### Issue: "401 Unauthorized"
**Solution**: 
1. Verify `CDR_API_SECRET` matches in both projects
2. Check Bearer token is being sent
3. Verify format: `Authorization: Bearer YOUR_SECRET`

### Issue: "CORS Error"
**Solution**: 
1. Check `ALLOWED_ORIGINS` in CDR API
2. Ensure OVO App domain is included
3. Redeploy after changes

### Issue: "Domain Not Working"
**Solution**: 
1. Verify DNS CNAME record: `dig cdrs.ovoky.io`
2. Wait for DNS propagation (up to 48 hours, usually < 1 hour)
3. Check domain status in Vercel dashboard

## 📞 Need Help?

- Check Vercel function logs
- Review `PRE_LAUNCH_CHECKLIST.md`
- See `docs/VERCEL_DEPLOYMENT.md` for detailed guide

## 🎯 Quick Commands Reference

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs

# Check deployment status
vercel ls

# Remove deployment
vercel rm [deployment-url]
```

---

**Ready to deploy?** Run: `vercel --prod` 🚀

