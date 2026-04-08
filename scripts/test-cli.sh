#!/bin/bash
# ForgeNexus CLI Test Suite
# Test all group commands and workflows

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
FORGENEXUS_DIR="$ROOT_DIR/forgenexus"
TEST_GROUP="cli-test-group"

echo "========================================"
echo "ForgeNexus CLI Test Suite"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
}

fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    FAILED=$((FAILED + 1))
}

warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

info() {
    echo -e "ℹ️  $1"
}

FAILED=0

# Build forgenexus first
echo "========================================"
echo "Step 1: Building ForgeNexus"
echo "========================================"
cd "$FORGENEXUS_DIR"
if npm run build > /dev/null 2>&1; then
    pass "Build successful"
else
    fail "Build failed"
    exit 1
fi
cd "$ROOT_DIR"

# Initialize registry for testing
echo ""
echo "========================================"
echo "Step 2: Initialize Test Registry"
echo "========================================"

# Clean up any existing test group
"$FORGENEXUS_DIR/node_modules/.bin/ts-node" -e "
import { listGroups, deleteGroup } from './src/data/groups.js';
const groups = listGroups();
for (const g of groups) {
    if (g.name === '$TEST_GROUP') {
        deleteGroup(g.name);
        console.log('Cleaned up existing test group');
    }
}
" 2>/dev/null || true

# Remove registry to start fresh
rm -f "$FORGENEXUS_DIR/.forgenexus/registry.kuzu" 2>/dev/null || true

# Rebuild to recreate registry
cd "$FORGENEXUS_DIR"
npm run build > /dev/null 2>&1
cd "$ROOT_DIR"

pass "Test registry initialized"

# Test commands
echo ""
echo "========================================"
echo "Step 3: Testing Group Commands"
echo "========================================"

CLI="$FORGENEXUS_DIR/dist/cli/index.js"

# Test 1: Group list (empty)
info "Test 1: Group list (empty)"
OUTPUT=$("$CLI" group list 2>&1)
if echo "$OUTPUT" | grep -q "No groups"; then
    pass "Group list (empty)"
else
    fail "Group list (empty)"
fi

# Test 2: Group create
info "Test 2: Group create"
OUTPUT=$("$CLI" group create "$TEST_GROUP" "Test group for CLI" 2>&1)
if echo "$OUTPUT" | grep -q "created"; then
    pass "Group create"
else
    fail "Group create"
fi

# Test 3: Group list
info "Test 3: Group list"
OUTPUT=$("$CLI" group list 2>&1)
if echo "$OUTPUT" | grep -q "$TEST_GROUP"; then
    pass "Group list"
else
    fail "Group list"
fi

# Test 4: Group add
info "Test 4: Group add"
OUTPUT=$("$CLI" group add "$TEST_GROUP" forgewright 2>&1)
if echo "$OUTPUT" | grep -q "Added"; then
    pass "Group add"
else
    fail "Group add"
fi

# Test 5: Group contracts (before sync)
info "Test 5: Group contracts (before sync)"
OUTPUT=$("$CLI" group contracts "$TEST_GROUP" 2>&1)
if echo "$OUTPUT" | grep -q "No contracts\|contracts found"; then
    pass "Group contracts (before sync)"
else
    fail "Group contracts (before sync)"
fi

# Test 6: Group status
info "Test 6: Group status"
OUTPUT=$("$CLI" group status "$TEST_GROUP" 2>&1)
if echo "$OUTPUT" | grep -q "Group Status"; then
    pass "Group status"
else
    fail "Group status"
fi

# Test 7: Group sync
info "Test 7: Group sync"
OUTPUT=$("$CLI" group sync "$TEST_GROUP" 2>&1)
if echo "$OUTPUT" | grep -q "Synced"; then
    pass "Group sync"
else
    fail "Group sync"
fi

# Test 8: Group contracts (after sync)
info "Test 8: Group contracts (after sync)"
OUTPUT=$("$CLI" group contracts "$TEST_GROUP" 2>&1)
if echo "$OUTPUT" | grep -q "Contracts"; then
    pass "Group contracts (after sync)"
else
    fail "Group contracts (after sync)"
fi

# Test 9: Group query
info "Test 9: Group query"
OUTPUT=$("$CLI" group query "$TEST_GROUP" "analyze" 2>&1)
if echo "$OUTPUT" | grep -q "Query Results"; then
    pass "Group query"
else
    fail "Group query"
fi

# Test 10: Group remove
info "Test 10: Group remove"
OUTPUT=$("$CLI" group remove "$TEST_GROUP" forgewright 2>&1)
if echo "$OUTPUT" | grep -q "Removed"; then
    pass "Group remove"
else
    fail "Group remove"
fi

# Cleanup
echo ""
echo "========================================"
echo "Step 4: Cleanup"
echo "========================================"
rm -f "$FORGENEXUS_DIR/.forgenexus/registry.kuzu" 2>/dev/null || true
pass "Test registry cleaned up"

# Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✅${NC}"
    exit 0
else
    echo -e "${RED}$FAILED test(s) failed ❌${NC}"
    exit 1
fi
