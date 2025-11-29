#!/bin/bash

# Quick fix deployment script for monitoring endpoints
# Run this on the VPS: ssh user@server 'bash -s' < quick-deploy.sh

set -e

echo "🚀 Deploying monitoring endpoints fix..."

# Navigate to project
cd /var/www/cdr-api

# Pull latest changes
echo "📥 Pulling from git..."
git pull origin main

# Install dependencies (in case something changed)
echo "📦 Installing dependencies..."
npm install --production

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Check if build was successful
if [ ! -f "dist/routes/monitoring.js" ]; then
    echo "❌ ERROR: monitoring.js not found in dist/routes/"
    echo "Build may have failed!"
    exit 1
fi

echo "✅ monitoring.js found in dist/routes/"

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart cdr-api

# Wait for startup
echo "⏳ Waiting for server to start..."
sleep 5

# Test the endpoints
echo ""
echo "🧪 Testing endpoints..."

# Test db/health
echo -n "Testing /db/health: "
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3001/db/health)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ OK (200)"
else
    echo "❌ FAILED ($HEALTH_RESPONSE)"
fi

# Test queue/stats
echo -n "Testing /queue/stats: "
QUEUE_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3001/queue/stats)
if [ "$QUEUE_RESPONSE" = "200" ]; then
    echo "✅ OK (200)"
else
    echo "❌ FAILED ($QUEUE_RESPONSE)"
fi

# Show detailed responses
echo ""
echo "📊 Detailed responses:"
echo ""
echo "DB Health:"
curl -s http://localhost:3001/db/health | jq '.' || curl -s http://localhost:3001/db/health
echo ""
echo ""
echo "Queue Stats:"
curl -s http://localhost:3001/queue/stats | jq '.' || curl -s http://localhost:3001/queue/stats

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Check logs with: pm2 logs cdr-api --lines 50"

