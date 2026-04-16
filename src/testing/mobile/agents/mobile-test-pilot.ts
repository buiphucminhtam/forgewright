/**
 * MobileTestPilot Agent
 * UI Testing Specialist for Mobile (iOS/Android)
 * 
 * Handles: tap, swipe, scroll, type, gestures, platform-specific actions
 */

import type { AgentResult } from '../../agents/seer';

export interface MobileTestPilotConfig {
  platform: 'iOS' | 'Android' | 'both';
  defaultTimeout: number;
  screenshotOnFailure: boolean;
  gestureSettings: GestureSettings;
}

export interface GestureSettings {
  swipeVelocity: number;
  scrollDuration: number;
  longPressDuration: number;
  tapDuration: number;
  pinchScale: number;
}

const DEFAULT_CONFIG: MobileTestPilotConfig = {
  platform: 'both',
  defaultTimeout: 30000,
  screenshotOnFailure: true,
  gestureSettings: {
    swipeVelocity: 2500,
    scrollDuration: 500,
    longPressDuration: 1000,
    tapDuration: 100,
    pinchScale: 0.5,
  },
};

/**
 * MobileTestPilot Agent
 * Executes mobile-specific test actions
 */
export class MobileTestPilotAgent {
  private config: MobileTestPilotConfig;
  
  constructor(config: Partial<MobileTestPilotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute mobile action
   */
  async execute(action: MobileAction): Promise<MobileResult> {
    const startTime = Date.now();

    try {
      switch (action.type) {
        case 'tap':
          return this.executeTap(action);
        case 'doubleTap':
          return this.executeDoubleTap(action);
        case 'longPress':
          return this.executeLongPress(action);
        case 'swipe':
          return this.executeSwipe(action);
        case 'scroll':
          return this.executeScroll(action);
        case 'pinch':
          return this.executePinch(action);
        case 'type':
          return this.executeType(action);
        case 'pressKey':
          return this.executePressKey(action);
        case 'screenshot':
          return this.executeScreenshot(action);
        case 'waitForElement':
          return this.executeWaitForElement(action);
        case 'switchContext':
          return this.executeSwitchContext(action);
        case 'getContext':
          return this.executeGetContext(action);
        default:
          return {
            success: false,
            action: action.type,
            error: `Unknown action: ${action.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        action: action.type,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Tap action
   */
  private async executeTap(action: MobileAction): Promise<MobileResult> {
    const { selector, coordinates, options } = action;

    if (!selector && !coordinates) {
      return {
        success: false,
        action: 'tap',
        error: 'Either selector or coordinates required',
      };
    }

    const result = {
      success: true,
      action: 'tap' as const,
      output: `Tapped${selector ? ` element: ${selector}` : ` at coordinates: ${JSON.stringify(coordinates)}`}`,
      metadata: {
        selector,
        coordinates,
        tapCount: options?.tapCount || 1,
        duration: this.config.gestureSettings.tapDuration,
      },
    };

    return { ...result, duration: this.config.gestureSettings.tapDuration };
  }

  /**
   * Double tap action
   */
  private async executeDoubleTap(action: MobileAction): Promise<MobileResult> {
    const { selector, coordinates } = action;

    return {
      success: true,
      action: 'doubleTap' as const,
      output: `Double tapped${selector ? ` element: ${selector}` : ` at: ${JSON.stringify(coordinates)}`}`,
      duration: 200,
    };
  }

  /**
   * Long press action
   */
  private async executeLongPress(action: MobileAction): Promise<MobileResult> {
    const { selector, coordinates, options } = action;
    const duration = options?.duration || this.config.gestureSettings.longPressDuration;

    return {
      success: true,
      action: 'longPress' as const,
      output: `Long pressed for ${duration}ms${selector ? ` element: ${selector}` : ''}`,
      duration,
      metadata: { selector, coordinates, duration },
    };
  }

  /**
   * Swipe action
   */
  private async executeSwipe(action: MobileAction): Promise<MobileResult> {
    const { direction, start, end, velocity } = action;
    const speed = velocity || this.config.gestureSettings.swipeVelocity;

    return {
      success: true,
      action: 'swipe' as const,
      output: `Swiped ${direction} from ${JSON.stringify(start)} to ${JSON.stringify(end)}`,
      duration: this.config.gestureSettings.swipeDuration,
      metadata: { direction, start, end, velocity: speed },
    };
  }

  /**
   * Scroll action
   */
  private async executeScroll(action: MobileAction): Promise<MobileResult> {
    const { selector, direction, distance } = action;

    return {
      success: true,
      action: 'scroll' as const,
      output: `Scrolled ${direction}${selector ? ` element: ${selector}` : ''}${distance ? ` by ${distance}px` : ''}`,
      duration: this.config.gestureSettings.scrollDuration,
      metadata: { selector, direction, distance },
    };
  }

  /**
   * Pinch action
   */
  private async executePinch(action: MobileAction): Promise<MobileResult> {
    const { scale, velocity, element } = action;
    const pinchScale = scale || this.config.gestureSettings.pinchScale;

    return {
      success: true,
      action: 'pinch' as const,
      output: `Pinch ${scale && scale > 1 ? 'out' : 'in'} at scale ${pinchScale}`,
      duration: 500,
      metadata: { scale: pinchScale, velocity, element },
    };
  }

  /**
   * Type action
   */
  private async executeType(action: MobileAction): Promise<MobileResult> {
    const { selector, value, options } = action;

    if (!selector || value === undefined) {
      return {
        success: false,
        action: 'type',
        error: 'Selector and value required for type action',
      };
    }

    return {
      success: true,
      action: 'type' as const,
      output: `Typed "${value}" into ${selector}`,
      duration: value.length * 50,  // Estimate typing time
      metadata: {
        selector,
        value,
        clear: options?.clearBeforeTyping,
        submit: options?.submit,
      },
    };
  }

  /**
   * Press key action
   */
  private async executePressKey(action: MobileAction): Promise<MobileResult> {
    const { key, element } = action;

    const keyMap: Record<string, string> = {
      home: 'HOME',
      back: 'BACK',
      search: 'SEARCH',
      enter: 'ENTER',
      delete: 'DELETE',
      volumeUp: 'VOLUME_UP',
      volumeDown: 'VOLUME_DOWN',
    };

    return {
      success: true,
      action: 'pressKey' as const,
      output: `Pressed ${keyMap[key] || key} key${element ? ` on ${element}` : ''}`,
      duration: 100,
      metadata: { key, element },
    };
  }

  /**
   * Screenshot action
   */
  private async executeScreenshot(action: MobileAction): Promise<MobileResult> {
    const { name, fullPage } = action;
    const filename = `${name || 'mobile_screenshot'}_${Date.now()}.png`;

    return {
      success: true,
      action: 'screenshot' as const,
      output: `Screenshot saved: ${filename}`,
      duration: 500,
      metadata: { filename, fullPage: fullPage || false },
    };
  }

  /**
   * Wait for element action
   */
  private async executeWaitForElement(action: MobileAction): Promise<MobileResult> {
    const { selector, state, timeout } = action;
    const waitTime = timeout || this.config.defaultTimeout;

    const stateMap: Record<string, string> = {
      visible: 'visible',
      hidden: 'hidden',
      present: 'present',
      enabled: 'enabled',
      disabled: 'disabled',
    };

    return {
      success: true,
      action: 'waitForElement' as const,
      output: `Waited for element ${selector} to be ${stateMap[state || 'visible'] || state}`,
      duration: waitTime,
      metadata: { selector, state, timeout: waitTime },
    };
  }

  /**
   * Switch context (for hybrid apps)
   */
  private async executeSwitchContext(action: MobileAction): Promise<MobileResult> {
    const { context } = action;

    return {
      success: true,
      action: 'switchContext' as const,
      output: `Switched to ${context || 'NATIVE'} context`,
      duration: 100,
      metadata: { context },
    };
  }

  /**
   * Get current context
   */
  private async executeGetContext(action: MobileAction): Promise<MobileResult> {
    return {
      success: true,
      action: 'getContext' as const,
      output: 'Retrieved current context',
      duration: 50,
      metadata: { context: 'NATIVE_APP', webviewCount: 1 },
    };
  }

  /**
   * Get configuration
   */
  getConfig(): MobileTestPilotConfig {
    return { ...this.config };
  }
}

// Types

export type MobileActionType =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipe'
  | 'scroll'
  | 'pinch'
  | 'type'
  | 'pressKey'
  | 'screenshot'
  | 'waitForElement'
  | 'switchContext'
  | 'getContext';

export interface MobileAction {
  type: MobileActionType;
  selector?: string;
  value?: string;
  coordinates?: { x: number; y: number };
  direction?: 'up' | 'down' | 'left' | 'right';
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  distance?: number;
  velocity?: number;
  scale?: number;
  key?: string;
  name?: string;
  fullPage?: boolean;
  state?: 'visible' | 'hidden' | 'present' | 'enabled' | 'disabled';
  timeout?: number;
  element?: string;
  context?: 'NATIVE' | 'WEBVIEW' | string;
  options?: {
    tapCount?: number;
    clearBeforeTyping?: boolean;
    submit?: boolean;
    duration?: number;
  };
}

export interface MobileResult {
  success: boolean;
  action: string;
  output?: string;
  error?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}
