#!/bin/bash

# Test script to verify the database connection retry logic works

echo "🧪 Testing CDR API database connection..."
echo ""

# Check if the API is running
if pm2 list | grep -q "cdr-api"; then
    echo "📊 Current PM2 status:"
    pm2 list | grep cdr-api
    echo ""
fi

# Test health endpoint
echo "🏥 Testing health endpoint..."
response=$(curl -s http://localhost:3001/health)

if [ $? -eq 0 ]; then
    echo "✅ Health endpoint responded:"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
    echo ""
    
    # Check if database is connected
    if echo "$response" | grep -q '"database":"connected"'; then
        echo "✅ Database is connected!"
    else
        echo "❌ Database is not connected"
    fi
else
    echo "❌ Could not reach health endpoint"
    echo "   Is the API running?"
fi

echo ""
echo "💡 To view live logs: pm2 logs cdr-api"
echo "💡 To restart: pm2 restart cdr-api"

