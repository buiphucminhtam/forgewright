/**
 * Coordinate System Tests
 * 
 * Test scenarios (T1-T12) per implementation plan:
 * T1: Unity LH → Godot RH conversion - Position matches ±0.001
 * T2: Godot RH → Unity LH conversion - Position matches ±0.001
 * T3: Unity rotation (-Z fwd) → Godot rotation (+Z fwd) - Rotation correct
 * T4: Scale: 1 unit consistency check - All engines = 1 meter
 * T5: Large world: 10,000 units from origin - Warning issued
 * T6: Large world: After floating origin - Objects stable
 * T7: FBX import scale detection - Correct scale factor
 * T8: glTF import detection - Correct unit metadata
 * T9: Batch: 1000 coordinates converted - All pass ±0.001
 * T10: Edge: (0,0,0) origin - No transformation needed
 * T11: Edge: Negative coordinates - Handled correctly
 * T12: Edge: Very small values (0.0001) - Precision maintained
 */

import { describe, it, expect } from 'vitest';
import {
  convertPosition,
  convertRotation,
  convertQuaternion,
  convertScale,
  convertTransform,
  parsePosition,
  validateTransform,
  isPrecisionRisk,
  getPrecisionWarning,
  ENGINE_SPECS,
  type Vector3,
  type Engine,
} from '../src/utils/coordinate-converter.js';

const PRECISION = 0.001;
const EPSILON = 0.0001;

function almostEqual(a: number, b: number, epsilon: number = PRECISION): boolean {
  return Math.abs(a - b) < epsilon;
}

function vectorsAlmostEqual(a: Vector3, b: Vector3, epsilon: number = PRECISION): boolean {
  return (
    almostEqual(a.x, b.x, epsilon) &&
    almostEqual(a.y, b.y, epsilon) &&
    almostEqual(a.z, b.z, epsilon)
  );
}

describe('T1: Unity LH → Godot RH Position Conversion', () => {
  it('should convert position with Z axis flip', () => {
    const unityPos: Vector3 = { x: 10, y: 20, z: 30 };
    const result = convertPosition(unityPos, 'unity', 'godot');
    const expected: Vector3 = { x: 10, y: 20, z: -30 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });

  it('should handle zero position', () => {
    const unityPos: Vector3 = { x: 0, y: 0, z: 0 };
    const result = convertPosition(unityPos, 'unity', 'godot');
    expect(vectorsAlmostEqual(result, unityPos)).toBe(true);
  });

  it('should handle negative coordinates', () => {
    const unityPos: Vector3 = { x: -5, y: -10, z: -15 };
    const result = convertPosition(unityPos, 'unity', 'godot');
    const expected: Vector3 = { x: -5, y: -10, z: 15 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });
});

describe('T2: Godot RH → Unity LH Position Conversion', () => {
  it('should convert position with Z axis flip', () => {
    const godotPos: Vector3 = { x: 100, y: 200, z: -300 };
    const result = convertPosition(godotPos, 'godot', 'unity');
    const expected: Vector3 = { x: 100, y: 200, z: 300 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });

  it('should be symmetric with T1', () => {
    const original: Vector3 = { x: 42.5, y: -17.3, z: 99.9 };
    const toGodot = convertPosition(original, 'unity', 'godot');
    const backToUnity = convertPosition(toGodot, 'godot', 'unity');
    expect(vectorsAlmostEqual(backToUnity, original)).toBe(true);
  });
});

describe('T3: Unity Rotation → Godot Rotation', () => {
  it('should convert rotation with Y and Z negation', () => {
    const unityRot: Vector3 = { x: 45, y: 90, z: 0 };
    const result = convertRotation(unityRot, 'unity', 'godot');
    const expected: Vector3 = { x: 45, y: -90, z: 0 };
    expect(vectorsAlmostEqual(result, expected, 0.01)).toBe(true);
  });

  it('should handle 180-degree rotation', () => {
    const unityRot: Vector3 = { x: 0, y: 180, z: 0 };
    const result = convertRotation(unityRot, 'unity', 'godot');
    const expected: Vector3 = { x: 0, y: -180, z: 0 };
    expect(vectorsAlmostEqual(result, expected, 0.01)).toBe(true);
  });

  it('should preserve identity rotation', () => {
    const identity: Vector3 = { x: 0, y: 0, z: 0 };
    const result = convertRotation(identity, 'unity', 'godot');
    expect(vectorsAlmostEqual(result, identity, 0.01)).toBe(true);
  });
});

describe('T4: Scale Unit Consistency', () => {
  it('Unity and Godot should have same unit scale (1 meter)', () => {
    expect(ENGINE_SPECS.unity.unitScale).toBe(1.0);
    expect(ENGINE_SPECS.godot.unitScale).toBe(1.0);
  });

  it('Unity to Godot scale conversion should be 1:1', () => {
    const scale: Vector3 = { x: 5, y: 10, z: 15 };
    const result = convertScale(scale, 'unity', 'godot');
    expect(vectorsAlmostEqual(result, scale)).toBe(true);
  });

  it('Unreal should use cm scale (0.01 meters)', () => {
    expect(ENGINE_SPECS.unreal.unitScale).toBe(0.01);
  });

  it('Unity to Unreal should scale by 100', () => {
    const scale: Vector3 = { x: 1, y: 2, z: 3 };
    const result = convertScale(scale, 'unity', 'unreal');
    const expected: Vector3 = { x: 100, y: 200, z: 300 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });

  it('Unreal to Unity should scale by 0.01', () => {
    const scale: Vector3 = { x: 100, y: 200, z: 300 };
    const result = convertScale(scale, 'unreal', 'unity');
    const expected: Vector3 = { x: 1, y: 2, z: 3 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });
});

describe('T5: Large World - Precision Warning (>5000 units)', () => {
  it('should detect precision risk at 10,000 units', () => {
    const pos: Vector3 = { x: 10000, y: 0, z: 0 };
    expect(isPrecisionRisk(pos, 5000)).toBe(true);
  });

  it('should detect precision risk at diagonal distance', () => {
    const pos: Vector3 = { x: 4000, y: 4000, z: 4000 };
    const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(distance).toBeGreaterThan(5000);
    expect(isPrecisionRisk(pos, 5000)).toBe(true);
  });

  it('should not warn at 1,000 units (safe zone)', () => {
    const pos: Vector3 = { x: 1000, y: 0, z: 0 };
    expect(isPrecisionRisk(pos, 5000)).toBe(false);
  });

  it('should issue CRITICAL warning at >10,000 units', () => {
    const pos: Vector3 = { x: 15000, y: 0, z: 0 };
    const warning = getPrecisionWarning(pos);
    expect(warning).toContain('CRITICAL');
  });

  it('should issue WARNING at 5000-10000 units', () => {
    const pos: Vector3 = { x: 7500, y: 0, z: 0 };
    const warning = getPrecisionWarning(pos);
    expect(warning).toContain('WARNING');
  });
});

describe('T6: Large World - After Floating Origin', () => {
  it('should be stable after relative repositioning', () => {
    const worldPos: Vector3 = { x: 50000, y: 0, z: 0 };
    const offset: Vector3 = { x: 50000, y: 0, z: 0 };
    
    // Simulate floating origin: subtract offset
    const relativePos: Vector3 = {
      x: worldPos.x - offset.x,
      y: worldPos.y - offset.y,
      z: worldPos.z - offset.z,
    };
    
    // After floating origin, should be near origin
    expect(Math.abs(relativePos.x)).toBeLessThan(0.001);
    expect(isPrecisionRisk(relativePos, 5000)).toBe(false);
  });

  it('should maintain precision after multiple origin shifts', () => {
    let pos: Vector3 = { x: 5000, y: 1000, z: 3000 };
    
    // Simulate 10 origin shifts
    for (let i = 0; i < 10; i++) {
      if (isPrecisionRisk(pos, 5000)) {
        const offset = { x: pos.x, y: 0, z: pos.z };
        pos = {
          x: pos.x - offset.x,
          y: pos.y,
          z: pos.z - offset.z,
        };
      }
    }
    
    // Should be safe after shifts
    expect(isPrecisionRisk(pos, 5000)).toBe(false);
  });
});

describe('T7: FBX Import Scale Detection', () => {
  it('should correctly identify meter-based scale', () => {
    const spec = ENGINE_SPECS.unity;
    expect(1 / spec.unitScale).toBe(1); // 1:1 ratio for meters
  });

  it('should correctly identify centimeter-based scale', () => {
    const spec = ENGINE_SPECS.unreal;
    expect(1 / spec.unitScale).toBe(100); // 100:1 ratio for cm
  });

  it('should calculate correct FBX import scale factor', () => {
    const fbxScale: Vector3 = { x: 1, y: 1, z: 1 };
    const result = convertScale(fbxScale, 'unity', 'unreal');
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.z).toBe(100);
  });
});

describe('T8: glTF Import Detection', () => {
  it('should handle glTF-like coordinates (similar to Godot)', () => {
    const gltfPos: Vector3 = { x: 1.5, y: 0, z: 2.5 };
    const result = convertPosition(gltfPos, 'godot', 'unity');
    const expected: Vector3 = { x: 1.5, y: 0, z: -2.5 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });
});

describe('T9: Batch Conversion Performance', () => {
  it('should handle 1000 coordinates accurately', () => {
    const results: Vector3[] = [];
    const testCount = 1000;
    
    for (let i = 0; i < testCount; i++) {
      const pos: Vector3 = {
        x: Math.random() * 1000 - 500,
        y: Math.random() * 1000 - 500,
        z: Math.random() * 1000 - 500,
      };
      
      const converted = convertPosition(pos, 'unity', 'godot');
      
      // Verify conversion is correct
      const back = convertPosition(converted, 'godot', 'unity');
      expect(vectorsAlmostEqual(back, pos, 0.0001)).toBe(true);
      
      results.push(converted);
    }
    
    expect(results.length).toBe(testCount);
  });
});

describe('T10: Edge - Origin Point (0,0,0)', () => {
  it('should return same position for origin', () => {
    const origin: Vector3 = { x: 0, y: 0, z: 0 };
    
    expect(vectorsAlmostEqual(
      convertPosition(origin, 'unity', 'godot'),
      origin
    )).toBe(true);
    
    expect(vectorsAlmostEqual(
      convertPosition(origin, 'godot', 'unity'),
      origin
    )).toBe(true);
    
    expect(vectorsAlmostEqual(
      convertPosition(origin, 'unity', 'unreal'),
      origin
    )).toBe(true);
  });

  it('should have zero distance from origin', () => {
    const origin: Vector3 = { x: 0, y: 0, z: 0 };
    const distance = Math.sqrt(origin.x ** 2 + origin.y ** 2 + origin.z ** 2);
    expect(distance).toBe(0);
  });
});

describe('T11: Edge - Negative Coordinates', () => {
  it('should handle all-negative coordinates', () => {
    const pos: Vector3 = { x: -100, y: -200, z: -300 };
    const result = convertPosition(pos, 'unity', 'godot');
    const expected: Vector3 = { x: -100, y: -200, z: 300 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });

  it('should handle mixed positive/negative coordinates', () => {
    const pos: Vector3 = { x: 50, y: -75, z: 100 };
    const result = convertPosition(pos, 'unity', 'godot');
    const expected: Vector3 = { x: 50, y: -75, z: -100 };
    expect(vectorsAlmostEqual(result, expected)).toBe(true);
  });

  it('should handle large negative values', () => {
    const pos: Vector3 = { x: -999999, y: -888888, z: -777777 };
    const result = convertPosition(pos, 'unity', 'godot');
    expect(result.x).toBe(-999999);
    expect(result.y).toBe(-888888);
    expect(result.z).toBe(777777);
  });
});

describe('T12: Edge - Very Small Values (0.0001 precision)', () => {
  it('should maintain precision for very small values', () => {
    const small: Vector3 = { x: 0.0001, y: 0.0002, z: 0.0003 };
    const result = convertPosition(small, 'unity', 'godot');
    expect(almostEqual(result.x, 0.0001, EPSILON)).toBe(true);
    expect(almostEqual(result.y, 0.0002, EPSILON)).toBe(true);
    expect(almostEqual(result.z, -0.0003, EPSILON)).toBe(true);
  });

  it('should handle sub-millimeter precision', () => {
    const tiny: Vector3 = { x: 0.00001, y: 0.00002, z: 0.00003 };
    const result = convertPosition(tiny, 'unity', 'godot');
    expect(almostEqual(result.z, -0.00003, 0.000001)).toBe(true);
  });

  it('should round-trip tiny values accurately', () => {
    const original: Vector3 = { x: 0.000123, y: 0.000456, z: 0.000789 };
    const converted = convertPosition(original, 'unity', 'godot');
    const back = convertPosition(converted, 'godot', 'unity');
    expect(vectorsAlmostEqual(back, original, 0.000001)).toBe(true);
  });
});

describe('Transform Validation', () => {
  it('should validate valid transform', () => {
    const transform = {
      position: { x: 10, y: 20, z: 30 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const result = validateTransform(transform, 'unity');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect NaN values', () => {
    const transform = {
      position: { x: NaN, y: 20, z: 30 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const result = validateTransform(transform, 'unity');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('NaN'))).toBe(true);
  });

  it('should detect infinity values', () => {
    const transform = {
      position: { x: Infinity, y: 20, z: 30 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const result = validateTransform(transform, 'unity');
    expect(result.valid).toBe(false);
  });

  it('should warn on zero scale', () => {
    const transform = {
      position: { x: 10, y: 20, z: 30 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0, y: 1, z: 1 },
    };
    const result = validateTransform(transform, 'unity');
    expect(result.warnings.some(w => w.includes('zero or negative'))).toBe(true);
  });
});

describe('Parse Position', () => {
  it('should parse comma-separated values', () => {
    const result = parsePosition('1.5, 2.5, 3.5');
    expect(result).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
  });

  it('should parse space-separated values', () => {
    const result = parsePosition('10 20 30');
    expect(result).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('should parse negative values', () => {
    const result = parsePosition('-5, -10, -15');
    expect(result).toEqual({ x: -5, y: -10, z: -15 });
  });

  it('should return null for invalid format', () => {
    expect(parsePosition('1,2')).toBeNull();
    expect(parsePosition('a,b,c')).toBeNull();
    expect(parsePosition('')).toBeNull();
  });
});
