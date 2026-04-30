/**
 * Tests for Community Cache / Incremental Community Detection
 */

import { describe, it, expect } from 'vitest'
import {
  analyzeCommunityChanges,
  determineUpdateStrategy,
  computeCommunityMetrics,
  validateCommunityQuality,
  logCommunityDecision,
  getCommunityThresholds,
  type ChangeAnalysis,
  type UpdateStrategy,
} from './community-cache.js'
import type { Community } from '../types.js'

describe('Community Cache', () => {
  describe('analyzeCommunityChanges', () => {
    it('should analyze changes correctly', () => {
      const changedFiles = new Set(['src/a.ts', 'src/b.ts'])
      const allFiles = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts'])

      const result = analyzeCommunityChanges(changedFiles, 3, allFiles)

      expect(result.totalNodes).toBe(150) // 3 * 50
      expect(result.changedNodes).toBe(100) // 2 * 50
      expect(result.changeRatio).toBeCloseTo(0.667, 1)
      expect(result.affectedFiles.size).toBe(2)
    })

    it('should identify new files', () => {
      const changedFiles = new Set(['src/new/file.ts'])
      const allFiles = new Set(['src/a.ts', 'src/b.ts'])

      const result = analyzeCommunityChanges(changedFiles, 2, allFiles)

      expect(result.newFiles.size).toBeGreaterThanOrEqual(1)
    })
  })

  describe('determineUpdateStrategy', () => {
    it('should return "none" for no changes', () => {
      const analysis: ChangeAnalysis = {
        totalNodes: 1000,
        changedNodes: 0,
        changeRatio: 0,
        affectedFiles: new Set(),
        newFiles: new Set(),
        deletedFiles: new Set(),
      }

      expect(determineUpdateStrategy(analysis)).toBe('none')
    })

    it('should return "incremental" for <5% changes', () => {
      const analysis: ChangeAnalysis = {
        totalNodes: 1000,
        changedNodes: 30, // 3%
        changeRatio: 0.03,
        affectedFiles: new Set(['file1.ts']),
        newFiles: new Set(),
        deletedFiles: new Set(),
      }

      expect(determineUpdateStrategy(analysis)).toBe('incremental')
    })

    it('should return "aggressive" for 5-20% changes', () => {
      const analysis: ChangeAnalysis = {
        totalNodes: 1000,
        changedNodes: 100, // 10%
        changeRatio: 0.10,
        affectedFiles: new Set(['file1.ts']),
        newFiles: new Set(),
        deletedFiles: new Set(),
      }

      expect(determineUpdateStrategy(analysis)).toBe('aggressive')
    })

    it('should return "full" for >=20% changes', () => {
      const analysis: ChangeAnalysis = {
        totalNodes: 1000,
        changedNodes: 250, // 25%
        changeRatio: 0.25,
        affectedFiles: new Set(['file1.ts']),
        newFiles: new Set(),
        deletedFiles: new Set(),
      }

      expect(determineUpdateStrategy(analysis)).toBe('full')
    })
  })

  describe('computeCommunityMetrics', () => {
    it('should compute metrics for empty communities', () => {
      const metrics = computeCommunityMetrics([])

      expect(metrics.originalCommunityCount).toBe(0)
      expect(metrics.averageCohesion).toBe(0)
      expect(metrics.stabilityScore).toBe(0)
    })

    it('should compute average cohesion', () => {
      const communities: Community[] = [
        { id: 'c1', name: 'test', nodes: [], keywords: [], description: '', cohesion: 0.8, symbolCount: 10 },
        { id: 'c2', name: 'test2', nodes: [], keywords: [], description: '', cohesion: 0.4, symbolCount: 5 },
      ]

      const metrics = computeCommunityMetrics(communities)

      expect(metrics.averageCohesion).toBe(0.6)
      expect(metrics.stabilityScore).toBe(1.0) // Both have cohesion >= 0.3
    })
  })

  describe('validateCommunityQuality', () => {
    it('should return true for good quality', () => {
      const metrics = {
        originalCommunityCount: 10,
        newCommunityCount: 10,
        mergedCommunities: 0,
        createdCommunities: 0,
        deletedCommunities: 0,
        averageCohesion: 0.5,
        stabilityScore: 0.8,
      }

      expect(validateCommunityQuality(metrics)).toBe(true)
    })

    it('should return false for low cohesion', () => {
      const metrics = {
        originalCommunityCount: 10,
        newCommunityCount: 10,
        mergedCommunities: 0,
        createdCommunities: 0,
        deletedCommunities: 0,
        averageCohesion: 0.2, // < 0.3
        stabilityScore: 0.8,
      }

      expect(validateCommunityQuality(metrics)).toBe(false)
    })

    it('should return false for low stability', () => {
      const metrics = {
        originalCommunityCount: 10,
        newCommunityCount: 10,
        mergedCommunities: 0,
        createdCommunities: 0,
        deletedCommunities: 0,
        averageCohesion: 0.5,
        stabilityScore: 0.3, // < 0.5
      }

      expect(validateCommunityQuality(metrics)).toBe(false)
    })
  })

  describe('getCommunityThresholds', () => {
    it('should return threshold values', () => {
      const thresholds = getCommunityThresholds()

      expect(thresholds.safe).toBe(0.05)
      expect(thresholds.aggressive).toBe(0.20)
      expect(thresholds.minCohesion).toBe(0.3)
      expect(thresholds.minModularity).toBe(0.4)
    })
  })

  describe('logCommunityDecision', () => {
    it('should not throw', () => {
      const analysis: ChangeAnalysis = {
        totalNodes: 1000,
        changedNodes: 50,
        changeRatio: 0.05,
        affectedFiles: new Set(['file.ts']),
        newFiles: new Set(),
        deletedFiles: new Set(),
      }

      const metrics = {
        originalCommunityCount: 10,
        newCommunityCount: 10,
        mergedCommunities: 0,
        createdCommunities: 0,
        deletedCommunities: 0,
        averageCohesion: 0.6,
        stabilityScore: 0.8,
      }

      expect(() => logCommunityDecision(analysis, 'incremental', metrics)).not.toThrow()
    })
  })
})
