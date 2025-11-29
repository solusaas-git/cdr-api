#!/bin/bash

# Script to deploy the PostgreSQL replica startup fix + Queue layer
# Run this on your VPS

set -e

echo "🚀 Deploying CDR API with replica fix + queue layer..."

# Navigate to project directory
cd /var/www/cdr-api

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull

# Install dependencies (in case package.json changed)
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart cdr-api

# Wait a moment for startup
echo "⏳ Waiting for startup..."
sleep 10

# Check PM2 status
echo "📊 PM2 Status:"
pm2 status

# Test health endpoint
echo ""
echo "🏥 Testing health endpoint..."
health_response=$(curl -s http://localhost:3001/health || echo "failed")
if [ "$health_response" != "failed" ]; then
    echo "$health_response" | jq '.' 2>/dev/null || echo "$health_response"
else
    echo "⚠️  Health check endpoint not responding yet (may still be starting up)"
fi

# Test queue stats
echo ""
echo "📊 Queue Statistics:"
queue_response=$(curl -s http://localhost:3001/queue/stats || echo "failed")
if [ "$queue_response" != "failed" ]; then
    echo "$queue_response" | jq '.' 2>/dev/null || echo "$queue_response"
else
    echo "⚠️  Queue stats endpoint not responding yet"
fi

# Show logs
echo ""
echo "📋 Recent logs:"
pm2 logs cdr-api --lines 30 --nostream

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📚 Next steps:"
echo "  💡 Monitor logs: pm2 logs cdr-api"
echo "  💡 Check queue: curl http://localhost:3001/queue/stats"
echo "  💡 Health check: curl http://localhost:3001/health"
echo "  💡 View docs: cat QUEUE_IMPLEMENTATION.md"


