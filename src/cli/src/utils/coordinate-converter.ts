/**
 * Coordinate System Converter Library
 * Handles conversions between Unity, Godot, Unreal, and Blender
 */

export type Engine = 'unity' | 'godot' | 'unreal' | 'blender';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  position: Vector3;
  rotation: Vector3; // Euler angles in degrees
  scale: Vector3;
}

export interface CoordinateSystem {
  handedness: 'left' | 'right';
  forwardAxis: 'x' | 'y' | 'z';
  forwardSign: 1 | -1;
  unitScale: number; // 1 unit = X meters
}

/**
 * Engine coordinate system definitions
 */
export const ENGINE_SPECS: Record<Engine, CoordinateSystem> = {
  unity: {
    handedness: 'left',
    forwardAxis: 'z',
    forwardSign: -1,
    unitScale: 1.0, // 1 unit = 1 meter
  },
  godot: {
    handedness: 'right',
    forwardAxis: 'z',
    forwardSign: 1,
    unitScale: 1.0, // 1 unit = 1 meter
  },
  unreal: {
    handedness: 'left',
    forwardAxis: 'z',
    forwardSign: 1,
    unitScale: 0.01, // 1 unit = 1 cm = 0.01 meters
  },
  blender: {
    handedness: 'right',
    forwardAxis: 'y', // or z in newer versions
    forwardSign: -1,
    unitScale: 1.0, // 1 unit = 1 meter
  },
};

/**
 * Convert position between two engines
 */
export function convertPosition(pos: Vector3, from: Engine, to: Engine): Vector3 {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];

  let result: Vector3 = { ...pos };

  // Handle handedness flip (LH → RH or RH → LH)
  if (fromSpec.handedness !== toSpec.handedness) {
    result = flipHandedness(result);
  }

  // Handle unit scale conversion
  const scaleFactor = toSpec.unitScale / fromSpec.unitScale;
  if (scaleFactor !== 1.0) {
    result = {
      x: result.x * scaleFactor,
      y: result.y * scaleFactor,
      z: result.z * scaleFactor,
    };
  }

  return result;
}

/**
 * Flip coordinates between left-handed and right-handed systems
 */
function flipHandedness(pos: Vector3): Vector3 {
  return {
    x: pos.x,
    y: pos.y,
    z: -pos.z,
  };
}

/**
 * Convert rotation (Euler angles in degrees) between engines
 */
export function convertRotation(euler: Vector3, from: Engine, to: Engine): Vector3 {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];

  let result: Vector3 = { ...euler };

  // Handle handedness flip
  if (fromSpec.handedness !== toSpec.handedness) {
    result = {
      x: result.x,
      y: -result.y,
      z: -result.z,
    };
  }

  return result;
}

/**
 * Convert quaternion between engines
 */
export function convertQuaternion(quat: Quaternion, from: Engine, to: Engine): Quaternion {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];

  let result: Quaternion = { ...quat };

  // Handle handedness flip
  if (fromSpec.handedness !== toSpec.handedness) {
    result = {
      x: quat.x,
      y: quat.y,
      z: -quat.z,
      w: -quat.w,
    };
  }

  return result;
}

/**
 * Convert scale between engines
 * Note: Scale conversion depends on the unit system
 * Unity: 1 unit = 1 meter
 * Unreal: 1 unit = 1 cm
 * So 1 meter in Unity = 100 units in Unreal
 */
export function convertScale(scale: Vector3, from: Engine, to: Engine): Vector3 {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];

  // Scale factor: fromSpec.unitScale / toSpec.unitScale
  // Unity (1.0 m) to Unreal (0.01 m): 1.0 / 0.01 = 100
  // Unreal (0.01 m) to Unity (1.0 m): 0.01 / 1.0 = 0.01
  const scaleFactor = fromSpec.unitScale / toSpec.unitScale;

  return {
    x: scale.x * scaleFactor,
    y: scale.y * scaleFactor,
    z: scale.z * scaleFactor,
  };
}

/**
 * Convert full transform between engines
 */
export function convertTransform(transform: Transform, from: Engine, to: Engine): Transform {
  return {
    position: convertPosition(transform.position, from, to),
    rotation: convertRotation(transform.rotation, from, to),
    scale: convertScale(transform.scale, from, to),
  };
}

/**
 * Calculate distance from origin
 */
export function distanceFromOrigin(pos: Vector3): number {
  return Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
}

/**
 * Check if coordinates are in precision danger zone (>5000 units from origin)
 */
export function isPrecisionRisk(pos: Vector3, threshold: number = 5000): boolean {
  return distanceFromOrigin(pos) > threshold;
}

/**
 * Get precision warning message
 */
export function getPrecisionWarning(pos: Vector3): string {
  const distance = distanceFromOrigin(pos);
  if (distance > 10000) {
    return `CRITICAL: Position is ${distance.toFixed(0)} units from origin. Floating point precision may cause jittering, snapping, or teleportation. Consider using Floating Origin pattern.`;
  } else if (distance > 5000) {
    return `WARNING: Position is ${distance.toFixed(0)} units from origin. Precision may decrease. Consider implementing Floating Origin.`;
  } else if (distance > 1000) {
    return `INFO: Position is ${distance.toFixed(0)} units from origin. Still safe but monitor for precision issues.`;
  }
  return '';
}

/**
 * Validate transform bounds
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

export function validateTransform(transform: Transform, engine: Engine): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
  };

  // Check for NaN/Infinity
  const coords = [transform.position, transform.rotation, transform.scale];
  for (const coord of coords) {
    if (isNaN(coord.x) || isNaN(coord.y) || isNaN(coord.z)) {
      result.errors.push('Transform contains NaN values');
      result.valid = false;
    }
    if (!isFinite(coord.x) || !isFinite(coord.y) || !isFinite(coord.z)) {
      result.errors.push('Transform contains infinite values');
      result.valid = false;
    }
  }

  // Check scale validity
  if (transform.scale.x <= 0 || transform.scale.y <= 0 || transform.scale.z <= 0) {
    result.warnings.push('Scale has zero or negative values. This may cause rendering issues.');
  }

  // Check precision risk
  const precisionWarning = getPrecisionWarning(transform.position);
  if (precisionWarning.includes('CRITICAL')) {
    result.errors.push(precisionWarning);
    result.valid = false;
  } else if (precisionWarning.includes('WARNING')) {
    result.warnings.push(precisionWarning);
  } else if (precisionWarning) {
    result.info.push(precisionWarning);
  }

  // Check rotation validity
  for (const angle of [transform.rotation.x, transform.rotation.y, transform.rotation.z]) {
    if (Math.abs(angle) > 36000) {
      result.warnings.push(`Rotation angle ${angle}° is extremely large. Consider normalizing.`);
    }
  }

  return result;
}

/**
 * Parse position string (e.g., "1,2,3" or "1.5, 2.5, 3.5")
 */
export function parsePosition(str: string): Vector3 | null {
  const parts = str.split(/[,\s]+/).map((p) => parseFloat(p.trim()));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { x: parts[0], y: parts[1], z: parts[2] };
}

/**
 * Format position as string
 */
export function formatPosition(pos: Vector3, precision: number = 3): string {
  return `${pos.x.toFixed(precision)}, ${pos.y.toFixed(precision)}, ${pos.z.toFixed(precision)}`;
}

/**
 * Format rotation as string
 */
export function formatRotation(euler: Vector3, precision: number = 2): string {
  return `${euler.x.toFixed(precision)}°, ${euler.y.toFixed(precision)}°, ${euler.z.toFixed(precision)}°`;
}

/**
 * Format scale as string
 */
export function formatScale(scale: Vector3, precision: number = 3): string {
  return `${scale.x.toFixed(precision)}, ${scale.y.toFixed(precision)}, ${scale.z.toFixed(precision)}`;
}

/**
 * Format transform as multi-line string
 */
export function formatTransform(transform: Transform, includeLabels: boolean = true): string {
  const lines: string[] = [];
  if (includeLabels) {
    lines.push(`Position: ${formatPosition(transform.position)}`);
    lines.push(`Rotation: ${formatRotation(transform.rotation)}`);
    lines.push(`Scale:    ${formatScale(transform.scale)}`);
  } else {
    lines.push(formatPosition(transform.position));
    lines.push(formatRotation(transform.rotation));
    lines.push(formatScale(transform.scale));
  }
  return lines.join('\n');
}
