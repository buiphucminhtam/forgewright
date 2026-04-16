/**
 * GestureAgent
 * Handles complex touch gestures for mobile testing
 * 
 * Supports: Multi-touch, drag-drop, orientation, system gestures
 */

export interface GestureAgentConfig {
  defaultVelocity: number;
  defaultDuration: number;
  swipeSteps: number;
}

const DEFAULT_CONFIG: GestureAgentConfig = {
  defaultVelocity: 2500,
  defaultDuration: 300,
  swipeSteps: 10,
};

/**
 * GestureAgent
 * Complex gesture handling for mobile automation
 */
export class GestureAgent {
  private config: GestureAgentConfig;

  constructor(config: Partial<GestureAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute gesture
   */
  async execute(gesture: MobileGesture): Promise<GestureResult> {
    const startTime = Date.now();

    try {
      switch (gesture.type) {
        case 'swipe':
          return this.executeSwipe(gesture);
        case 'drag':
          return this.executeDrag(gesture);
        case 'pinch':
          return this.executePinch(gesture);
        case 'zoom':
          return this.executeZoom(gesture);
        case 'rotate':
          return this.executeRotate(gesture);
        case 'multiTouch':
          return this.executeMultiTouch(gesture);
        case 'scroll':
          return this.executeScroll(gesture);
        case 'pullToRefresh':
          return this.executePullToRefresh(gesture);
        case 'longPress':
          return this.executeLongPress(gesture);
        default:
          return {
            success: false,
            gesture: gesture.type,
            error: `Unknown gesture: ${gesture.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        gesture: gesture.type,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Swipe gesture
   */
  private executeSwipe(gesture: MobileGesture): GestureResult {
    const { direction, startX, startY, endX, endY, velocity, steps } = gesture;
    
    // Calculate coordinates based on direction if not provided
    const coords = this.calculateSwipeCoordinates(direction!, startX, startY, endX, endY);
    
    return {
      success: true,
      gesture: 'swipe',
      output: `Swiped ${direction} from (${coords.startX}, ${coords.startY}) to (${coords.endX}, ${coords.endY})`,
      metadata: {
        direction,
        ...coords,
        velocity: velocity || this.config.defaultVelocity,
        steps: steps || this.config.swipeSteps,
      },
      duration: this.config.defaultDuration,
    };
  }

  /**
   * Drag gesture (slower, with hold)
   */
  private executeDrag(gesture: MobileGesture): GestureResult {
    const { startX, startY, endX, endY, duration, steps } = gesture;
    
    const dragDuration = duration || 1000;  // Drag is slower than swipe
    
    return {
      success: true,
      gesture: 'drag',
      output: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`,
      metadata: {
        start: { x: startX!, y: startY! },
        end: { x: endX!, y: endY! },
        duration: dragDuration,
        steps: steps || this.config.swipeSteps,
      },
      duration: dragDuration,
    };
  }

  /**
   * Pinch gesture
   */
  private executePinch(gesture: MobileGesture): GestureResult {
    const { scale, center, velocity } = gesture;
    
    if (scale === undefined) {
      return {
        success: false,
        gesture: 'pinch',
        error: 'Scale is required for pinch gesture',
      };
    }
    
    const pinchScale = scale < 1 ? 'in' : 'out';
    
    return {
      success: true,
      gesture: 'pinch',
      output: `Pinched ${pinchScale} at scale ${Math.abs(scale)}`,
      metadata: {
        scale: Math.abs(scale),
        direction: pinchScale,
        center: center || { x: 0.5, y: 0.5 },  // Default to center of screen
        velocity: velocity || this.config.defaultVelocity,
      },
      duration: 500,
    };
  }

  /**
   * Zoom gesture
   */
  private executeZoom(gesture: MobileGesture): GestureResult {
    const { scale } = gesture;
    
    if (scale === undefined) {
      return {
        success: false,
        gesture: 'zoom',
        error: 'Scale is required for zoom gesture',
      };
    }
    
    return {
      success: true,
      gesture: 'zoom',
      output: `Zoomed ${scale > 1 ? 'in' : 'out'} by ${Math.abs(scale)}x`,
      metadata: {
        scale: Math.abs(scale),
        direction: scale > 1 ? 'in' : 'out',
      },
      duration: 600,
    };
  }

  /**
   * Rotate gesture
   */
  private executeRotate(gesture: MobileGesture): GestureResult {
    const { angle, center, touchCount } = gesture;
    
    return {
      success: true,
      gesture: 'rotate',
      output: `Rotated ${angle || 90} degrees`,
      metadata: {
        angle: angle || 90,
        center: center || { x: 0.5, y: 0.5 },
        touchCount: touchCount || 2,
      },
      duration: 500,
    };
  }

  /**
   * Multi-touch gesture
   */
  private executeMultiTouch(gesture: MobileGesture): GestureResult {
    const { touches, action } = gesture;
    
    if (!touches || touches.length < 2) {
      return {
        success: false,
        gesture: 'multiTouch',
        error: 'At least 2 touch points required',
      };
    }
    
    return {
      success: true,
      gesture: 'multiTouch',
      output: `Multi-touch ${action || 'tap'} with ${touches.length} fingers`,
      metadata: {
        touches: touches.map(t => ({ x: t.x, y: t.y })),
        action: action || 'tap',
      },
      duration: 200,
    };
  }

  /**
   * Scroll gesture
   */
  private executeScroll(gesture: MobileGesture): GestureResult {
    const { direction, distance, element } = gesture;
    
    return {
      success: true,
      gesture: 'scroll',
      output: `Scrolled ${direction}${element ? ` element: ${element}` : ''}`,
      metadata: {
        direction: direction || 'down',
        distance: distance || 500,
        element: gesture.element,
      },
      duration: this.config.defaultDuration,
    };
  }

  /**
   * Pull to refresh gesture
   */
  private executePullToRefresh(gesture: MobileGesture): GestureResult {
    const { element } = gesture;
    
    return {
      success: true,
      gesture: 'pullToRefresh',
      output: `Pulled to refresh${element ? ` on ${element}` : ''}`,
      metadata: {
        element: gesture.element,
        threshold: 150,  // Pull threshold to trigger refresh
      },
      duration: 1000,
    };
  }

  /**
   * Long press gesture
   */
  private executeLongPress(gesture: MobileGesture): GestureResult {
    const { x, y, duration, element } = gesture;
    
    const pressDuration = duration || 1000;
    
    return {
      success: true,
      gesture: 'longPress',
      output: `Long pressed at (${x}, ${y})${element ? ` on ${element}` : ''}`,
      metadata: {
        x,
        y,
        element,
        duration: pressDuration,
      },
      duration: pressDuration,
    };
  }

  /**
   * Calculate swipe coordinates
   */
  private calculateSwipeCoordinates(
    direction: string,
    startX?: number,
    startY?: number,
    endX?: number,
    endY?: number
  ): { startX: number; startY: number; endX: number; endY: number } {
    const distance = 500;  // Default swipe distance
    const screenCenterX = 0.5;
    const screenCenterY = 0.5;

    // If all coordinates provided, use them
    if (startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
      return { startX, startY, endX, endY };
    }

    // Calculate based on direction
    switch (direction) {
      case 'up':
        return {
          startX: startX ?? screenCenterX,
          startY: startY ?? 0.7,
          endX: endX ?? screenCenterX,
          endY: endY ?? 0.3,
        };
      case 'down':
        return {
          startX: startX ?? screenCenterX,
          startY: startY ?? 0.3,
          endX: endX ?? screenCenterX,
          endY: endY ?? 0.7,
        };
      case 'left':
        return {
          startX: startX ?? 0.7,
          startY: startY ?? screenCenterY,
          endX: endX ?? 0.3,
          endY: endY ?? screenCenterY,
        };
      case 'right':
        return {
          startX: startX ?? 0.3,
          startY: startY ?? screenCenterY,
          endX: endX ?? 0.7,
          endY: endY ?? screenCenterY,
        };
      default:
        return {
          startX: screenCenterX,
          startY: 0.7,
          endX: screenCenterX,
          endY: 0.3,
        };
    }
  }

  /**
   * Get configuration
   */
  getConfig(): GestureAgentConfig {
    return { ...this.config };
  }
}

// Types

export type GestureType =
  | 'swipe'
  | 'drag'
  | 'pinch'
  | 'zoom'
  | 'rotate'
  | 'multiTouch'
  | 'scroll'
  | 'pullToRefresh'
  | 'longPress';

export interface TouchPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface MobileGesture {
  type: GestureType;
  
  // Swipe
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  velocity?: number;
  steps?: number;
  
  // Drag
  duration?: number;
  
  // Pinch/Zoom
  scale?: number;
  center?: { x: number; y: number };
  
  // Rotate
  angle?: number;
  touchCount?: number;
  
  // Multi-touch
  touches?: TouchPoint[];
  action?: 'tap' | 'hold';
  
  // Scroll
  distance?: number;
  element?: string;
  
  // Long press
  x?: number;
  y?: number;
}

export interface GestureResult {
  success: boolean;
  gesture: string;
  output?: string;
  error?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}
