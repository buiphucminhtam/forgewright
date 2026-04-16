/**
 * Mobile Visual Testing
 * Device-aware screenshot capture and comparison
 */

import type { Platform } from '../../appium/config';

export interface DeviceSnapshot {
  platform: Platform;
  deviceName: string;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
  safeArea: SafeArea;
  pixelDensity: number;
  screenshot: string;  // Base64 or path
  timestamp: number;
  notch: NotchInfo;
}

export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface NotchInfo {
  hasNotch: boolean;
  type: 'notch' | 'dynamic-island' | 'hole-punch' | 'none';
  position: 'top-left' | 'top-center' | 'top-right' | 'none';
}

export interface VisualDiff {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'added' | 'removed' | 'changed';
  confidence: number;
  colorDiff?: number;
}

export interface VisualTestResult {
  passed: boolean;
  diffPercentage: number;
  diffs: VisualDiff[];
  baseline?: DeviceSnapshot;
  current?: DeviceSnapshot;
}

/**
 * Mobile Visual Tester
 * Handles visual testing with device awareness
 */
export class MobileVisualTester {
  private baseline: Map<string, DeviceSnapshot> = new Map();

  /**
   * Capture device snapshot
   */
  async captureSnapshot(
    platform: Platform,
    deviceName: string,
    screenshot: string,
    orientation: 'portrait' | 'landscape' = 'portrait'
  ): Promise<DeviceSnapshot> {
    const { width, height } = await this.getScreenDimensions(screenshot);
    const safeArea = this.detectSafeArea(platform, deviceName);
    const notch = this.detectNotch(platform, deviceName);

    return {
      platform,
      deviceName,
      screenWidth: orientation === 'portrait' ? width : height,
      screenHeight: orientation === 'portrait' ? height : width,
      orientation,
      safeArea,
      pixelDensity: this.getPixelDensity(platform, deviceName),
      screenshot,
      timestamp: Date.now(),
      notch,
    };
  }

  /**
   * Set baseline snapshot
   */
  setBaseline(key: string, snapshot: DeviceSnapshot): void {
    this.baseline.set(key, snapshot);
  }

  /**
   * Compare with baseline
   */
  compare(current: DeviceSnapshot, baselineKey: string): VisualTestResult {
    const baseline = this.baseline.get(baselineKey);
    
    if (!baseline) {
      return {
        passed: true,
        diffPercentage: 0,
        diffs: [],
        current,
      };
    }

    // Check if same device
    if (current.deviceName !== baseline.deviceName) {
      return {
        passed: false,
        diffPercentage: 100,
        diffs: [{
          x: 0,
          y: 0,
          width: current.screenWidth,
          height: current.screenHeight,
          type: 'changed',
          confidence: 1,
        }],
        baseline,
        current,
      });
    }

    // Calculate diff percentage
    const diffs = this.calculateDiffs(baseline, current);
    const diffPercentage = this.calculateDiffPercentage(diffs, current);

    return {
      passed: diffPercentage < 0.05,  // 5% threshold
      diffPercentage,
      diffs,
      baseline,
      current,
    };
  }

  /**
   * Compare across devices
   */
  compareAcrossDevices(
    snapshots: DeviceSnapshot[],
    options?: {
      ignoreSafeArea?: boolean;
      ignoreNotch?: boolean;
      responsiveThreshold?: number;
    }
  ): VisualTestResult {
    const opts = {
      ignoreSafeArea: true,
      ignoreNotch: true,
      responsiveThreshold: 0.1,
      ...options,
    };

    // Find reference (largest device)
    const reference = snapshots.reduce((largest, current) =>
      (current.screenWidth * current.screenHeight) > (largest.screenWidth * largest.screenHeight)
        ? current
        : largest
    );

    const allDiffs: VisualDiff[] = [];

    for (const snapshot of snapshots) {
      if (snapshot === reference) continue;

      let snapshotDiffs = this.calculateDiffs(reference, snapshot);

      // Filter out safe area differences
      if (opts.ignoreSafeArea) {
        snapshotDiffs = snapshotDiffs.filter(diff =>
          !this.isInSafeArea(diff, reference.safeArea)
        );
      }

      // Filter out notch differences
      if (opts.ignoreNotch) {
        snapshotDiffs = snapshotDiffs.filter(diff =>
          !this.isInNotchArea(diff, reference.notch)
        );
      }

      allDiffs.push(...snapshotDiffs);
    }

    const avgDiff = allDiffs.length / snapshots.length;

    return {
      passed: avgDiff < opts.responsiveThreshold!,
      diffPercentage: avgDiff,
      diffs: allDiffs,
      baseline: reference,
    };
  }

  /**
   * Get screen dimensions from screenshot
   */
  private async getScreenDimensions(screenshot: string): Promise<{ width: number; height: number }> {
    // In real implementation, decode image
    // For now, return placeholder
    return { width: 1080, height: 1920 };
  }

  /**
   * Detect safe area for device
   */
  private detectSafeArea(platform: Platform, deviceName: string): SafeArea {
    // iOS safe areas
    if (platform === 'iOS') {
      if (deviceName.includes('iPhone 15 Pro Max')) {
        return { top: 59, bottom: 34, left: 0, right: 0 };
      }
      if (deviceName.includes('iPhone 15 Pro') || deviceName.includes('iPhone 14 Pro')) {
        return { top: 54, bottom: 34, left: 0, right: 0 };
      }
      if (deviceName.includes('iPhone')) {
        return { top: 47, bottom: 34, left: 0, right: 0 };
      }
      if (deviceName.includes('iPad')) {
        return { top: 24, bottom: 24, left: 0, right: 0 };
      }
    }

    // Android safe areas (typically smaller)
    return { top: 24, bottom: 24, left: 0, right: 0 };
  }

  /**
   * Detect notch type
   */
  private detectNotch(platform: Platform, deviceName: string): NotchInfo {
    if (platform === 'iOS') {
      if (deviceName.includes('15 Pro') || deviceName.includes('14 Pro')) {
        return { hasNotch: true, type: 'dynamic-island', position: 'top-center' };
      }
      if (deviceName.includes('iPhone')) {
        return { hasNotch: true, type: 'notch', position: 'top-center' };
      }
    }

    if (platform === 'Android') {
      if (deviceName.includes('Pixel')) {
        return { hasNotch: true, type: 'hole-punch', position: 'top-center' };
      }
      if (deviceName.includes('Samsung')) {
        return { hasNotch: false, type: 'none', position: 'none' };
      }
    }

    return { hasNotch: false, type: 'none', position: 'none' };
  }

  /**
   * Get pixel density
   */
  private getPixelDensity(platform: Platform, deviceName: string): number {
    // @1x, @2x, @3x for iOS
    if (platform === 'iOS') {
      if (deviceName.includes('Plus') || deviceName.includes('Max') || deviceName.includes('Pro Max')) {
        return 3;
      }
      if (deviceName.includes('Pro') || deviceName.includes('14') || deviceName.includes('15')) {
        return 3;
      }
      return 2;
    }

    // dpi for Android (xxhdpi ~3x)
    return 3;
  }

  /**
   * Calculate visual diffs
   */
  private calculateDiffs(baseline: DeviceSnapshot, current: DeviceSnapshot): VisualDiff[] {
    // Simplified diff calculation
    // In real implementation, use pixel comparison
    const diffs: VisualDiff[] = [];

    // If dimensions differ significantly, mark as changed
    if (Math.abs(baseline.screenWidth - current.screenWidth) > 50) {
      diffs.push({
        x: 0,
        y: 0,
        width: current.screenWidth,
        height: current.screenHeight,
        type: 'changed',
        confidence: 0.9,
      });
    }

    return diffs;
  }

  /**
   * Calculate diff percentage
   */
  private calculateDiffPercentage(diffs: VisualDiff[], current: DeviceSnapshot): number {
    if (diffs.length === 0) return 0;

    const totalArea = current.screenWidth * current.screenHeight;
    const diffArea = diffs.reduce((sum, diff) => sum + (diff.width * diff.height), 0);

    return diffArea / totalArea;
  }

  /**
   * Check if diff is in safe area
   */
  private isInSafeArea(diff: VisualDiff, safeArea: SafeArea): boolean {
    // Check if diff is entirely within safe area
    return (
      diff.y < safeArea.top ||
      diff.y + diff.height > (diff.height - safeArea.bottom)
    );
  }

  /**
   * Check if diff is in notch area
   */
  private isInNotchArea(diff: VisualDiff, notch: NotchInfo): boolean {
    if (!notch.hasNotch) return false;

    // Notch area is typically top 50-60px, center
    return diff.y < 60 && diff.x < 200 && (diff.x + diff.width) > (diff.width - 200);
  }

  /**
   * Clear baselines
   */
  clearBaselines(): void {
    this.baseline.clear();
  }
}

/**
 * Device Matrix Tester
 * Test across multiple device configurations
 */
export class DeviceMatrixTester {
  private snapshots: Map<string, DeviceSnapshot[]> = new Map();

  /**
   * Add snapshot to matrix
   */
  addSnapshot(testName: string, snapshot: DeviceSnapshot): void {
    if (!this.snapshots.has(testName)) {
      this.snapshots.set(testName, []);
    }
    this.snapshots.get(testName)!.push(snapshot);
  }

  /**
   * Get all snapshots for test
   */
  getSnapshots(testName: string): DeviceSnapshot[] {
    return this.snapshots.get(testName) || [];
  }

  /**
   * Compare all devices for test
   */
  compareAll(testName: string): {
    testName: string;
    deviceCount: number;
    passed: boolean;
    results: VisualTestResult[];
  } {
    const snapshots = this.getSnapshots(testName);
    const results: VisualTestResult[] = [];
    let allPassed = true;

    const visualTester = new MobileVisualTester();

    for (let i = 0; i < snapshots.length; i++) {
      for (let j = i + 1; j < snapshots.length; j++) {
        visualTester.setBaseline(`${i}`, snapshots[i]);
        const result = visualTester.compare(snapshots[j], `${i}`);
        results.push(result);
        if (!result.passed) allPassed = false;
      }
    }

    return {
      testName,
      deviceCount: snapshots.length,
      passed: allPassed,
      results,
    };
  }
}
