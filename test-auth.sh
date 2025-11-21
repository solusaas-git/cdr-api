#!/bin/bash

# CDR API Authentication Test Script
# Tests that authentication is working correctly

API_URL="${CDR_API_URL:-http://localhost:3002}"
API_SECRET="${API_SECRET:-7nf67YQfjKb701tm3W8Gp8A4n4gYak1TY5svoiJYk/A=}"

echo "=========================================="
echo "CDR API Authentication Test"
echo "=========================================="
echo "API URL: $API_URL"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test 1: Health check (should be public)
echo "Test 1: Health check endpoint (should be public)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "503" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Health check is public (status: $STATUS)"
  ((PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Expected 200 or 503, got $STATUS"
  ((FAILED++))
fi
echo

# Test 2: No auth header (should fail with 401)
echo "Test 2: Request without authentication"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/cdrs?i_account=123")
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$STATUS" = "401" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Correctly rejected unauthorized request"
  echo "Response: $BODY"
  ((PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Expected 401, got $STATUS"
  echo "Response: $BODY"
  ((FAILED++))
fi
echo

# Test 3: Wrong secret (should fail with 401)
echo "Test 3: Request with invalid secret"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer wrong-secret-12345" \
  "$API_URL/cdrs?i_account=123")
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$STATUS" = "401" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Correctly rejected invalid secret"
  echo "Response: $BODY"
  ((PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Expected 401, got $STATUS"
  echo "Response: $BODY"
  ((FAILED++))
fi
echo

# Test 4: Correct secret (should succeed with 200)
echo "Test 4: Request with valid secret"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_SECRET" \
  "$API_URL/cdrs?i_account=123&limit=1")
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Successfully authenticated"
  # Check if response contains expected fields
  if echo "$BODY" | grep -q '"success"'; then
    echo -e "${GREEN}✅ PASS${NC}: Response contains expected data structure"
    ((PASSED++))
  else
    echo -e "${YELLOW}⚠️  WARN${NC}: Response format unexpected"
    echo "Response: $BODY"
    ((PASSED++))
  fi
else
  echo -e "${RED}❌ FAIL${NC}: Expected 200, got $STATUS"
  echo "Response: $BODY"
  ((FAILED++))
fi
echo

# Test 5: Consumption endpoint with auth
echo "Test 5: Consumption endpoint with authentication"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_SECRET" \
  "$API_URL/consumption?i_account=123")
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Consumption endpoint authenticated successfully"
  ((PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Expected 200, got $STATUS"
  echo "Response: $BODY"
  ((FAILED++))
fi
echo

# Test 6: Stats endpoint with auth
echo "Test 6: Stats endpoint with authentication"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_SECRET" \
  "$API_URL/cdrs/stats?i_account=123")
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Stats endpoint authenticated successfully"
  ((PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Expected 200, got $STATUS"
  echo "Response: $BODY"
  ((FAILED++))
fi
echo

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Total tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed! Authentication is working correctly.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Please check the configuration.${NC}"
  echo
  echo "Troubleshooting:"
  echo "1. Verify API_SECRET is set in CDR API .env file"
  echo "2. Ensure CDR API is running: pm2 status"
  echo "3. Check CDR API logs: pm2 logs cdr-api"
  echo "4. Verify the secret matches: echo \$API_SECRET"
  exit 1
fi

