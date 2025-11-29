#!/bin/bash

# Hard restart script for PM2
# Run this on your VPS

echo "🔄 Performing hard restart of CDR API..."

# Stop the process completely
echo "⏸️  Stopping PM2..."
pm2 stop cdr-api

# Wait a moment
sleep 2

# Delete the process from PM2
echo "🗑️  Deleting from PM2..."
pm2 delete cdr-api

# Wait a moment
sleep 1

# Start fresh from ecosystem config
echo "🚀 Starting fresh..."
cd /var/www/cdr-api
pm2 start ecosystem.config.js

# Wait for startup
echo "⏳ Waiting for startup..."
sleep 5

# Check status
echo ""
echo "📊 PM2 Status:"
pm2 status

# Test endpoints
echo ""
echo "🧪 Testing endpoints..."
echo ""

echo "1. Root endpoint:"
curl -s http://localhost:3001/ | jq -r '.status' 2>/dev/null || echo "FAILED"

echo ""
echo "2. Health check:"
curl -s http://localhost:3001/health | jq -r '.status' 2>/dev/null || echo "FAILED"

echo ""
echo "3. DB Health:"
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/db-health.json http://localhost:3001/db/health)
echo "HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
    cat /tmp/db-health.json | jq '.' 2>/dev/null || cat /tmp/db-health.json
else
    echo "❌ FAILED - Response:"
    cat /tmp/db-health.json
fi

echo ""
echo "4. Queue Stats:"
HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/queue-stats.json http://localhost:3001/queue/stats)
echo "HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
    cat /tmp/queue-stats.json | jq '.' 2>/dev/null || cat /tmp/queue-stats.json
else
    echo "❌ FAILED - Response:"
    cat /tmp/queue-stats.json
fi

echo ""
echo "✅ Hard restart complete!"
echo ""
echo "View logs with: pm2 logs cdr-api"

