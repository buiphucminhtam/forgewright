# Plan: Test on Production with Real Repo

## Objective
Validate AST Cache implementation with real-world usage patterns.

## Test Scenarios

### Scenario 1: First Run (Cold Cache)
```bash
npx forgenexus analyze
# Expected: Full parse, no cache hits
```

**Metrics to capture:**
- Total time
- Files parsed
- Cache hit rate: 0%
- Memory usage

### Scenario 2: Re-run (Warm Cache)
```bash
# Không thay đổi gì
npx forgenexus analyze
# Expected: 100% cache hits (skip parsing)
```

**Metrics to capture:**
- Total time (should be 80-90% faster)
- Cache hit rate: 100%
- Speedup ratio

### Scenario 3: Partial Change
```bash
# Edit 1 file
echo "// comment" >> src/some/file.ts
npx forgenexus analyze
# Expected: Parse 1 file, rest from cache
```

**Metrics to capture:**
- Files parsed: 1
- Cache hits: total - 1
- Time for changed file vs cached files

### Scenario 4: Many Changes (>50%)
```bash
# Make many changes
npx forgenexus analyze --force
# Expected: Fallback to full parse
```

### Scenario 5: Cache Invalidation
```bash
# Clear cache
npx forgenexus clean
npx forgenexus analyze
# Expected: Full parse, cache miss
```

## Test Repository Options

### Option A: ForgeWright itself
- Files: ~3000
- Languages: TypeScript, JavaScript, Bash, Python
- Pros: Already available, realistic workload
- Cons: May be too small to show dramatic improvements

### Option B: Generate Test Data
```bash
# Create synthetic repo with N files
./scripts/generate-test-repo.sh --files 5000 --languages ts,js,py
```

### Option C: Clone Large Public Repo
```bash
# Example: VSCode, Next.js, etc.
git clone --depth 1 https://github.com/microsoft/vscode.git
```

## Measurement Framework

### Add to Indexer Output
```typescript
interface PerformanceMetrics {
  phaseTimes: Record<Phase, number>
  totalTime: number
  cacheStats: {
    hits: number
    misses: number
    hitRate: number
  }
  memoryUsage: {
    heapUsed: number
    heapTotal: number
  }
}
```

### Automated Benchmark Script
```bash
#!/bin/bash
# benchmark.sh

REPO=$1
ITERATIONS=3

echo "=== ForgeNexus Benchmark ==="
echo "Repo: $REPO"
echo "Iterations: $ITERATIONS"
echo ""

# Clean
npx forgenexus clean

# Cold run
echo "Cold run..."
START=$(date +%s%3N)
npx forgenexus analyze 2>&1 | grep "AST Cache"
END=$(date +%s%3N)
COLD_TIME=$((END - START))

# Warm runs
for i in $(seq 1 $ITERATIONS); do
  echo "Warm run $i..."
  START=$(date +%s%3N)
  npx forgenexus analyze 2>&1 | grep "AST Cache"
  END=$(date +%s%3N)
  WARM_TIME=$((END - START))
  echo "  Time: ${WARM_TIME}ms"
done

# Calculate speedup
SPEEDUP=$(echo "scale=2; $COLD_TIME / $WARM_TIME" | bc)
echo ""
echo "=== Results ==="
echo "Cold time: ${COLD_TIME}ms"
echo "Avg warm time: ${WARM_TIME}ms"
echo "Speedup: ${SPEEDUP}x"
```

## Acceptance Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cache hit rate (re-run) | >95% | Parse stats |
| Speedup (re-run vs cold) | >5x | Time comparison |
| Memory overhead | <100MB | Heap usage |
| Cache file size | <500MB | Disk usage |

## Validation Checklist

- [ ] Cold run completes successfully
- [ ] Warm run has >95% cache hits
- [ ] Partial change only parses changed file
- [ ] Cache invalidation works on file change
- [ ] `--force` bypasses cache
- [ ] Memory usage acceptable
- [ ] No cache corruption errors

## Error Scenarios to Test

1. **Cache file corrupted**: Delete one entry, verify graceful fallback
2. **Version mismatch**: Change tree-sitter version, verify re-parse
3. **Disk full**: Verify graceful error handling
4. **Concurrent runs**: Multiple analyze at once (should be safe)
