/**
 * Device Matrix Testing
 * Test execution across multiple device configurations
 */

import type { Platform } from '../../appium/config';
import { IOS_DEVICES } from '../../appium/capabilities/ios';
import { ANDROID_DEVICES } from '../../appium/capabilities/android';

export interface DeviceConfig {
  name: string;
  platform: Platform;
  osVersion: string;
  screenSize: string;
  orientation: 'portrait' | 'landscape';
}

export interface DeviceMatrix {
  name: string;
  devices: DeviceConfig[];
  parallel: boolean;
  failFast: boolean;
}

export interface MatrixResult {
  deviceName: string;
  passed: boolean;
  duration: number;
  error?: string;
  screenshots?: string[];
}

export interface MatrixExecutionResult {
  matrixName: string;
  totalDevices: number;
  passed: number;
  failed: number;
  duration: number;
  results: MatrixResult[];
}

/**
 * Predefined Device Matrices
 */
export const DEVICE_MATRICES = {
  // Popular devices for regression testing
  regression: {
    name: 'Regression',
    devices: [
      { name: 'iPhone 15 Pro', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.1"', orientation: 'portrait' as const },
      { name: 'iPhone 15', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.1"', orientation: 'portrait' as const },
      { name: 'Pixel 8', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.2"', orientation: 'portrait' as const },
      { name: 'Pixel 8 Pro', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.7"', orientation: 'portrait' as const },
    ],
    parallel: true,
    failFast: false,
  },

  // iOS only
  iosRegression: {
    name: 'iOS Regression',
    devices: [
      { name: 'iPhone 15 Pro Max', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.7"', orientation: 'portrait' as const },
      { name: 'iPhone 15 Pro', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.1"', orientation: 'portrait' as const },
      { name: 'iPhone 15', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.1"', orientation: 'portrait' as const },
      { name: 'iPhone SE (3rd gen)', platform: 'iOS' as Platform, osVersion: '16.0', screenSize: '4.7"', orientation: 'portrait' as const },
      { name: 'iPad Pro 12.9', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '12.9"', orientation: 'portrait' as const },
    ],
    parallel: true,
    failFast: false,
  },

  // Android only
  androidRegression: {
    name: 'Android Regression',
    devices: [
      { name: 'Pixel 8 Pro', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.7"', orientation: 'portrait' as const },
      { name: 'Pixel 8', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.2"', orientation: 'portrait' as const },
      { name: 'Samsung Galaxy S24 Ultra', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.8"', orientation: 'portrait' as const },
      { name: 'Samsung Galaxy A54', platform: 'Android' as Platform, osVersion: '13', screenSize: '6.4"', orientation: 'portrait' as const },
      { name: 'Xiaomi 14', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.36"', orientation: 'portrait' as const },
    ],
    parallel: true,
    failFast: false,
  },

  // Small screen devices
  smallScreens: {
    name: 'Small Screens',
    devices: [
      { name: 'iPhone SE (3rd gen)', platform: 'iOS' as Platform, osVersion: '16.0', screenSize: '4.7"', orientation: 'portrait' as const },
      { name: 'Pixel 7', platform: 'Android' as Platform, osVersion: '13', screenSize: '6.3"', orientation: 'portrait' as const },
    ],
    parallel: true,
    failFast: true,
  },

  // Large screen devices (tablets)
  largeScreens: {
    name: 'Large Screens',
    devices: [
      { name: 'iPad Pro 12.9', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '12.9"', orientation: 'portrait' as const },
      { name: 'Pixel Tablet', platform: 'Android' as Platform, osVersion: '14', screenSize: '10.95"', orientation: 'portrait' as const },
    ],
    parallel: true,
    failFast: false,
  },

  // Orientation matrix
  orientation: {
    name: 'Orientation',
    devices: [
      { name: 'iPhone 15 Pro', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.1"', orientation: 'portrait' as const },
      { name: 'iPhone 15 Pro', platform: 'iOS' as Platform, osVersion: '17.0', screenSize: '6.1"', orientation: 'landscape' as const },
      { name: 'Pixel 8', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.2"', orientation: 'portrait' as const },
      { name: 'Pixel 8', platform: 'Android' as Platform, osVersion: '14', screenSize: '6.2"', orientation: 'landscape' as const },
    ],
    parallel: true,
    failFast: false,
  },
};

/**
 * Device Matrix Runner
 * Executes tests across device matrix
 */
export class DeviceMatrixRunner {
  private results: MatrixResult[] = [];

  /**
   * Create custom matrix
   */
  createMatrix(
    name: string,
    deviceNames: string[],
    options?: { parallel?: boolean; failFast?: boolean }
  ): DeviceMatrix {
    const devices: DeviceConfig[] = [];

    for (const deviceName of deviceNames) {
      const iosDevice = IOS_DEVICES[deviceName];
      const androidDevice = ANDROID_DEVICES[deviceName];
      
      if (iosDevice) {
        devices.push({
          name: iosDevice.name,
          platform: 'iOS',
          osVersion: iosDevice.platformVersion,
          screenSize: '',
          orientation: iosDevice.orientation,
        });
      } else if (androidDevice) {
        devices.push({
          name: androidDevice.name,
          platform: 'Android',
          osVersion: androidDevice.platformVersion,
          screenSize: androidDevice.screenSize || '',
          orientation: androidDevice.orientation,
        });
      }
    }

    return {
      name,
      devices,
      parallel: options?.parallel ?? true,
      failFast: options?.failFast ?? false,
    };
  }

  /**
   * Execute matrix
   */
  async execute(
    matrix: DeviceMatrix,
    testFn: (device: DeviceConfig) => Promise<MatrixResult>
  ): Promise<MatrixExecutionResult> {
    const startTime = Date.now();
    this.results = [];

    if (matrix.parallel) {
      // Parallel execution
      const promises = matrix.devices.map(device =>
        this.runOnDevice(device, testFn, matrix.failFast)
      );
      await Promise.all(promises);
    } else {
      // Sequential execution
      for (const device of matrix.devices) {
        await this.runOnDevice(device, testFn, matrix.failFast);
      }
    }

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    return {
      matrixName: matrix.name,
      totalDevices: matrix.devices.length,
      passed,
      failed,
      duration: Date.now() - startTime,
      results: this.results,
    };
  }

  /**
   * Run test on device
   */
  private async runOnDevice(
    device: DeviceConfig,
    testFn: (device: DeviceConfig) => Promise<MatrixResult>,
    failFast: boolean
  ): Promise<MatrixResult> {
    const startTime = Date.now();

    try {
      const result = await testFn(device);
      const fullResult: MatrixResult = {
        ...result,
        deviceName: device.name,
        duration: Date.now() - startTime,
      };

      this.results.push(fullResult);
      return fullResult;
    } catch (error) {
      const errorResult: MatrixResult = {
        deviceName: device.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.results.push(errorResult);

      if (failFast) {
        throw error;
      }

      return errorResult;
    }
  }

  /**
   * Get results
   */
  getResults(): MatrixResult[] {
    return [...this.results];
  }

  /**
   * Clear results
   */
  clearResults(): void {
    this.results = [];
  }
}

/**
 * Device Selector
 * Smart device selection based on criteria
 */
export class DeviceSelector {
  /**
   * Select devices matching criteria
   */
  select(
    criteria: {
      platform?: Platform;
      minScreenSize?: string;
      maxScreenSize?: string;
      osVersion?: string;
      deviceType?: 'phone' | 'tablet';
    }
  ): DeviceConfig[] {
    const selected: DeviceConfig[] = [];

    // iOS devices
    for (const [name, device] of Object.entries(IOS_DEVICES)) {
      if (this.matchesCriteria(device, criteria, 'iOS', name)) {
        selected.push({
          name,
          platform: 'iOS',
          osVersion: device.platformVersion,
          screenSize: '',
          orientation: device.orientation,
        });
      }
    }

    // Android devices
    for (const [name, device] of Object.entries(ANDROID_DEVICES)) {
      if (this.matchesCriteria(device, criteria, 'Android', name)) {
        selected.push({
          name,
          platform: 'Android',
          osVersion: device.platformVersion,
          screenSize: device.screenSize || '',
          orientation: device.orientation,
        });
      }
    }

    return selected;
  }

  /**
   * Check if device matches criteria
   */
  private matchesCriteria(
    device: Record<string, unknown>,
    criteria: Parameters<DeviceSelector['select']>[0],
    platform: 'iOS' | 'Android',
    name: string
  ): boolean {
    if (criteria.platform && criteria.platform !== platform) {
      return false;
    }

    if (criteria.deviceType) {
      const deviceType = device['deviceType'];
      if (deviceType !== criteria.deviceType) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Device Factory
 * Creates device configurations from predefined devices
 */
export class DeviceFactory {
  /**
   * Create device config by name
   */
  static create(name: string): DeviceConfig | null {
    const iosDevice = IOS_DEVICES[name];
    if (iosDevice) {
      return {
        name: iosDevice.name,
        platform: 'iOS',
        osVersion: iosDevice.platformVersion,
        screenSize: '',
        orientation: iosDevice.orientation,
      };
    }

    const androidDevice = ANDROID_DEVICES[name];
    if (androidDevice) {
      return {
        name: androidDevice.name,
        platform: 'Android',
        osVersion: androidDevice.platformVersion,
        screenSize: androidDevice.screenSize || '',
        orientation: androidDevice.orientation,
      };
    }

    return null;
  }

  /**
   * Create all devices
   */
  static createAll(): DeviceConfig[] {
    const devices: DeviceConfig[] = [];

    for (const name of Object.keys(IOS_DEVICES)) {
      const device = this.create(name);
      if (device) devices.push(device);
    }

    for (const name of Object.keys(ANDROID_DEVICES)) {
      const device = this.create(name);
      if (device) devices.push(device);
    }

    return devices;
  }
}
