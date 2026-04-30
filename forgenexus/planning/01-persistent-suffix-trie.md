# Plan: Persistent Suffix Trie Cache

## Current Problem
```typescript
// Mỗi lần analyze đều build lại từ đầu
const allPaths = [...new Set([...files.map(f => f.path), ...this.db.getAllFilePaths()])]
const suffixIndex = buildSuffixIndex(allPaths)  // O(n * m) với n = số paths, m = độ sâu
```

## Proposed Solution
Lưu suffix trie vào DB, update incremental khi có file added/removed.

## Implementation Plan

### 1. Create Trie Persistence Layer
```
.forgenexus/
├── codebase.db
└── suffix_trie.json    # Serialized trie structure
```

### 2. New Module: `src/data/trie-cache.ts`

```typescript
interface TrieNode {
  children: Record<string, TrieNode | 'terminal'>
  count: number
  filePaths: string[]  // Reverse index: suffix -> files
}

export class TrieCache {
  // Save/load trie from JSON file
  save(trie: TrieNode): void
  load(): TrieNode | null

  // Incremental update
  addPath(path: string): void
  removePath(path: string): void

  // Check if rebuild needed
  needsRebuild(): boolean
}
```

### 3. Modify `indexer.ts`

```typescript
// Thay vì:
const suffixIndex = buildSuffixIndex(allPaths)

// Dùng:
const trieCache = new TrieCache(this.config.repoPath)
if (trieCache.needsRebuild()) {
  trieCache.rebuild(allPaths)
}
const suffixIndex = trieCache.getTrie()
```

### 4. Cache Invalidation Triggers
- File added: thêm suffix mới vào trie
- File deleted: xóa suffix khỏi trie
- File renamed: xóa cũ + thêm mới

## Scoring

| Criteria | Score | Rationale |
|----------|-------|-----------|
| Impact | 6/10 | Giảm thời gian index building, nhưng đã O(n) |
| Complexity | 7/10 | Trie serialization đơn giản |
| Risk | 8/10 | Read-only cache, fallback to rebuild nếu corrupt |
| Maintainability | 8/10 | Simple data structure |
| Reusability | 7/10 | Có thể dùng cho tools khác |
| Safety | 9/10 | Rebuild from scratch nếu corrupt |
| Measurability | 8/10 | Đo thời gian index building |
| Alignment | 7/10 | Performance optimization |

**Weighted Score: 7.30/10**

## Estimated Time Savings
- Repo 1000 files: ~100ms → ~10ms (90% reduction)
- Repo 5000 files: ~500ms → ~50ms (90% reduction)

## Implementation Order
1. Create `trie-cache.ts` module
2. Add save/load functions
3. Add incremental update functions
4. Integrate into indexer.ts
5. Write tests
