# Plan: Incremental Community Detection

## Current Problem
```typescript
// Mỗi lần analyze đều chạy Leiden trên toàn bộ graph
const communities = detectLeidenCommunities(allNodeIds, commEdges, nodeNames, {
  resolution: ...,
  maxIterations: ...,
})
```

## Proposed Solution
Chỉ re-run Leiden trên affected subgraph khi có file changes nhỏ.

## Analysis of Current Code

```typescript
// indexer.ts - dòng 337-373
// Hiện tại đã có partial support:
if (incremental && changedFilePaths.size > 0) {
  this.deleteAffectedCommunities(changedFilePaths)  // Xóa affected
} else {
  // Full rebuild
}

// Nhưng sau đó VẪN chạy trên toàn bộ graph
const communities = detectLeidenCommunities(allNodeIds, commEdges, nodeNames, {...})
```

## Implementation Plan

### 1. Add Community Stability Check
```typescript
// Kiểm tra xem community có ổn định không sau thay đổi nhỏ
interface CommunityStability {
  isStable: boolean
  affectedNodes: Set<string>
  newCommunities: Community[]
}
```

### 2. Incremental Algorithm

```
┌──────────────────────────────────────────────────────────────┐
│              Incremental Community Detection                  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Get affected nodes từ changed files                     │
│  2. Build subgraph (affected nodes + 1-hop neighbors)       │
│  3. Check stability threshold:                               │
│     - If (changed nodes < 5% of total) AND                  │
│       (no structural changes to edges):                      │
│       → Use existing communities, update only changed nodes  │
│     - Else:                                                 │
│       → Re-run Leiden on subgraph only                     │
│  4. Merge results với existing stable communities           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 3. Modified Indexer Logic

```typescript
// Thay vì:
this.deleteAffectedCommunities(changedFilePaths)
const communities = detectLeidenCommunities(allNodeIds, commEdges, ...)

// Làm:
const { needsFullRebuild, subgraph } = this.analyzeCommunityChanges(
  changedFilePaths,
  allNodes,
  allEdges
)

if (needsFullRebuild) {
  // Full rebuild
  this.db.exec('MATCH (c:Community) DELETE c')
  const communities = detectLeidenCommunities(allNodeIds, commEdges, ...)
} else {
  // Incremental: only subgraph
  const affectedNodeIds = this.getAffectedNodeIds(changedFilePaths)
  const subgraphEdges = this.getSubgraphEdges(affectedNodeIds, allEdges)
  const newCommunities = detectLeidenCommunities(affectedNodeIds, subgraphEdges, ...)
  // Merge với existing
}
```

### 4. Stability Metrics
- **Edge density change**: Nếu edges thay đổi < 10%, có thể incremental
- **Node ratio**: Nếu changed nodes < 5% total, incremental viable
- **Cross-boundary changes**: Nếu không có changes đến inter-community edges, stable

## Scoring

| Criteria | Score | Rationale |
|----------|-------|-----------|
| Impact | 7/10 | Giảm 10-20% thời gian community detection |
| Complexity | 6/10 | Cần subgraph extraction + merge logic |
| Risk | 6/10 | Community boundaries có thể shift không mong muốn |
| Maintainability | 7/10 | Algorithm complexity tăng |
| Reusability | 6/10 | Algorithm-specific |
| Safety | 8/10 | Fallback to full rebuild nếu partial fail |
| Measurability | 8/10 | Đo thời gian community detection |
| Alignment | 8/10 | Incremental approach |

**Weighted Score: 6.85/10**

## Estimated Time Savings
- Repo 10K nodes, 1% changed: ~2s → ~0.2s (90% reduction)
- Repo 10K nodes, 50% changed: full rebuild (~2s)

## Implementation Order
1. Add `CommunityStability` interface
2. Implement subgraph extraction
3. Add stability threshold logic
4. Modify indexer.ts
5. Write tests

## Edge Cases to Handle
- [ ] File deleted → nodes removed from community
- [ ] File renamed → path changes, update community membership
- [ ] Inter-file edges change → may affect community boundaries
- [ ] Very large file change (>20% of repo) → fallback to full rebuild
