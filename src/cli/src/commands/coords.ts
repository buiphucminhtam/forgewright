/**
 * Coords Command - Coordinate system conversion tools
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  convertPosition,
  convertRotation,
  convertQuaternion,
  convertScale,
  convertTransform,
  parsePosition,
  formatPosition,
  formatRotation,
  formatScale,
  validateTransform,
  isPrecisionRisk,
  getPrecisionWarning,
  ENGINE_SPECS,
  type Vector3,
  type Engine,
} from '../utils/coordinate-converter.js';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export function registerCoordsCommand(program: Command): void {
  const coords = program
    .command('coords')
    .description('Coordinate system conversion and validation tools');

  // Position conversion
  coords
    .command('convert')
    .description('Convert coordinates between game engines')
    .argument('<position>', 'Position in format "x,y,z"')
    .option('-f, --from <engine>', 'Source engine', 'unity')
    .option('-t, --to <engine>', 'Target engine', 'godot')
    .option('-r, --rotation <rot>', 'Rotation in format "x,y,z" (Euler degrees)')
    .option('-s, --scale <scale>', 'Scale in format "x,y,z"', '1,1,1')
    .option('-j, --json', 'Output as JSON')
    .option('-v, --verbose', 'Show conversion details')
    .action(async (position: string, options: CoordsConvertOptions) => {
      await handleConvert(position, options);
    });

  // Validate coordinates
  coords
    .command('validate')
    .description('Validate coordinate bounds and precision')
    .argument('<position>', 'Position in format "x,y,z"')
    .option('-e, --engine <engine>', 'Engine type', 'unity')
    .option('-r, --rotation <rot>', 'Rotation in format "x,y,z"')
    .option('-s, --scale <scale>', 'Scale in format "x,y,z"', '1,1,1')
    .option('-j, --json', 'Output as JSON')
    .option('-w, --warn-threshold <n>', 'Warning threshold for distance from origin', '5000')
    .action(async (position: string, options: CoordsValidateOptions) => {
      await handleValidate(position, options);
    });

  // List supported engines
  coords
    .command('engines')
    .description('List supported game engines and their coordinate systems')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { json: boolean }) => {
      await handleEngines(options);
    });

  // Quick reference
  coords
    .command('ref')
    .description('Show quick reference for coordinate conversions')
    .action(async () => {
      await handleRef();
    });

  // Batch convert (read from file or stdin)
  coords
    .command('batch')
    .description('Batch convert coordinates from CSV')
    .argument('[file]', 'Input CSV file (stdin if not specified)')
    .option('-f, --from <engine>', 'Source engine', 'unity')
    .option('-t, --to <engine>', 'Target engine', 'godot')
    .option('-c, --columns <cols>', 'Column indices for x,y,z (1-based)', '1,2,3')
    .option('-o, --output <file>', 'Output file (stdout if not specified)')
    .option('-j, --json', 'Output as JSON lines')
    .action(async (file: string | undefined, options: BatchOptions) => {
      await handleBatch(file, options);
    });
}

interface CoordsConvertOptions {
  from: string;
  to: string;
  rotation?: string;
  scale: string;
  json: boolean;
  verbose: boolean;
}

interface CoordsValidateOptions {
  engine: string;
  rotation?: string;
  scale: string;
  json: boolean;
  warnThreshold: string;
}

interface BatchOptions {
  from: string;
  to: string;
  columns: string;
  output?: string;
  json: boolean;
}

const VALID_ENGINES: Engine[] = ['unity', 'godot', 'unreal', 'blender'];

function isValidEngine(name: string): name is Engine {
  return VALID_ENGINES.includes(name as Engine);
}

async function handleConvert(position: string, options: CoordsConvertOptions): Promise<void> {
  const fromEngine = options.from.toLowerCase();
  const toEngine = options.to.toLowerCase();

  // Validate engines
  if (!isValidEngine(fromEngine)) {
    console.error(pc.red(`Invalid source engine: ${options.from}`));
    console.error(pc.dim(`Valid engines: ${VALID_ENGINES.join(', ')}`));
    process.exit(1);
  }
  if (!isValidEngine(toEngine)) {
    console.error(pc.red(`Invalid target engine: ${options.to}`));
    console.error(pc.dim(`Valid engines: ${VALID_ENGINES.join(', ')}`));
    process.exit(1);
  }

  // Parse position
  const pos = parsePosition(position);
  if (!pos) {
    console.error(pc.red(`Invalid position format: ${position}`));
    console.error(pc.dim('Expected format: "x,y,z" (e.g., "1.5, 2.0, -3.5")'));
    process.exit(1);
  }

  // Parse optional rotation and scale
  let rotation: Vector3 | null = null;
  if (options.rotation) {
    rotation = parsePosition(options.rotation);
    if (!rotation) {
      console.error(pc.red(`Invalid rotation format: ${options.rotation}`));
      process.exit(1);
    }
  }

  let scale = parsePosition(options.scale);
  if (!scale) {
    console.error(pc.red(`Invalid scale format: ${options.scale}`));
    process.exit(1);
  }

  const from = fromEngine as Engine;
  const to = toEngine as Engine;

  // Perform conversions
  const convertedPos = convertPosition(pos, from, to);
  const convertedScale = convertScale(scale, from, to);
  let convertedRot: Vector3 | null = null;
  if (rotation) {
    convertedRot = convertRotation(rotation, from, to);
  }

  // Check for precision risk
  const precisionWarning = getPrecisionWarning(convertedPos);

  // Output
  if (options.json) {
    const envelope = buildEnvelope('coords.convert', {
      source: { engine: from, position: pos, rotation, scale },
      target: { engine: to, position: convertedPos, rotation: convertedRot, scale: convertedScale },
      precisionWarning: precisionWarning || undefined,
    }, {
      ok: true,
      duration_ms: 0,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    // Pretty output
    console.log();
    console.log(pc.bold('  Coordinate Conversion'));
    console.log(pc.gray('  ' + '─'.repeat(50)));
    console.log();
    console.log(pc.dim(`  ${from.toUpperCase()} → ${to.toUpperCase()}`));
    console.log();

    console.log(pc.cyan('  Position:'));
    console.log(`    ${pc.dim('From:')} ${formatPosition(pos)}`);
    console.log(`    ${pc.dim('To:  ')} ${pc.green(formatPosition(convertedPos))}`);

    if (rotation && convertedRot) {
      console.log();
      console.log(pc.cyan('  Rotation:'));
      console.log(`    ${pc.dim('From:')} ${formatRotation(rotation)}`);
      console.log(`    ${pc.dim('To:  ')} ${pc.green(formatRotation(convertedRot))}`);
    }

    console.log();
    console.log(pc.cyan('  Scale:'));
    console.log(`    ${pc.dim('From:')} ${formatScale(scale)}`);
    console.log(`    ${pc.dim('To:  ')} ${pc.green(formatScale(convertedScale))}`);

    if (options.verbose) {
      console.log();
      console.log(pc.cyan('  Engine Specs:'));
      const fromSpec = ENGINE_SPECS[from];
      const toSpec = ENGINE_SPECS[to];
      console.log(`    ${from}: ${fromSpec.handedness}-handed, ${fromSpec.forwardSign === 1 ? '+' : '-'}${fromSpec.forwardAxis} forward, ${1/fromSpec.unitScale}:1 ratio`);
      console.log(`    ${to}: ${toSpec.handedness}-handed, ${toSpec.forwardSign === 1 ? '+' : '-'}${toSpec.forwardAxis} forward, ${1/toSpec.unitScale}:1 ratio`);
    }

    if (precisionWarning) {
      console.log();
      if (precisionWarning.includes('CRITICAL')) {
        console.log(pc.red(`  ⚠ ${precisionWarning}`));
      } else if (precisionWarning.includes('WARNING')) {
        console.log(pc.yellow(`  ⚠ ${precisionWarning}`));
      } else {
        console.log(pc.dim(`  ℹ ${precisionWarning}`));
      }
    }

    console.log();
  }
}

async function handleValidate(position: string, options: CoordsValidateOptions): Promise<void> {
  const engine = options.engine.toLowerCase();

  if (!isValidEngine(engine)) {
    console.error(pc.red(`Invalid engine: ${options.engine}`));
    process.exit(1);
  }

  const pos = parsePosition(position);
  if (!pos) {
    console.error(pc.red(`Invalid position format: ${position}`));
    process.exit(1);
  }

  let rotation: Vector3 | null = null;
  if (options.rotation) {
    rotation = parsePosition(options.rotation);
    if (!rotation) {
      console.error(pc.red(`Invalid rotation format: ${options.rotation}`));
      process.exit(1);
    }
  }

  const scale = parsePosition(options.scale) || { x: 1, y: 1, z: 1 };
  const threshold = parseFloat(options.warnThreshold) || 5000;

  const result = validateTransform(
    { position: pos, rotation: rotation || { x: 0, y: 0, z: 0 }, scale },
    engine as Engine
  );

  // Add custom threshold warning
  const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
  if (distance > threshold) {
    result.warnings.push(`Distance from origin (${distance.toFixed(0)}) exceeds threshold (${threshold})`);
  }

  if (options.json) {
    const envelope = buildEnvelope('coords.validate', {
      position: pos,
      engine,
      validation: result,
      distanceFromOrigin: distance,
    }, {
      ok: result.valid,
      duration_ms: 0,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc.bold('  Coordinate Validation'));
    console.log(pc.gray('  ' + '─'.repeat(50)));
    console.log();
    console.log(`  Engine: ${pc.cyan(engine.toUpperCase())}`);
    console.log(`  Position: ${formatPosition(pos)}`);
    console.log(`  Distance from origin: ${pc.bold(distance.toFixed(2))}`);
    console.log();

    if (result.errors.length === 0 && result.warnings.length === 0 && result.info.length === 0) {
      console.log(pc.green('  ✓ All checks passed'));
    } else {
      if (result.errors.length > 0) {
        console.log(pc.red('  ✗ Errors:'));
        for (const err of result.errors) {
          console.log(`    • ${err}`);
        }
        console.log();
      }

      if (result.warnings.length > 0) {
        console.log(pc.yellow('  ⚠ Warnings:'));
        for (const warn of result.warnings) {
          console.log(`    • ${warn}`);
        }
        console.log();
      }

      if (result.info.length > 0) {
        console.log(pc.dim('  ℹ Info:'));
        for (const info of result.info) {
          console.log(`    • ${info}`);
        }
      }
    }

    console.log();
    console.log(`  ${result.valid ? pc.green('✓ VALID') : pc.red('✗ INVALID')}`);
    console.log();
  }

  process.exit(result.valid ? 0 : 1);
}

async function handleEngines(options: { json: boolean }): Promise<void> {
  if (options.json) {
    const engineData = VALID_ENGINES.map((name) => ({
      name,
      ...ENGINE_SPECS[name],
      unitDescription: name === 'unreal' ? '1 unit = 1 cm' : '1 unit = 1 meter',
    }));
    console.log(JSON.stringify(buildEnvelope('coords.engines', engineData, {
      ok: true,
      duration_ms: 0,
      version: VERSION,
    }), null, 2));
  } else {
    console.log();
    console.log(pc.bold('  Supported Game Engines'));
    console.log(pc.gray('  ' + '─'.repeat(50)));
    console.log();

    for (const name of VALID_ENGINES) {
      const spec = ENGINE_SPECS[name];
      const handColor = spec.handedness === 'left' ? pc.cyan : pc.magenta;
      console.log(`  ${pc.bold(pc.green(name.toUpperCase()))}`);
      console.log(`    Handedness: ${handColor(spec.handedness)}-handed`);
      console.log(`    Forward: ${spec.forwardSign === 1 ? '+' : '-'}${spec.forwardAxis}`);
      console.log(`    Units: ${name === 'unreal' ? '1 unit = 1 cm' : '1 unit = 1 meter'}`);
      console.log();
    }
  }
}

async function handleRef(): Promise<void> {
  console.log();
  console.log(pc.bold('  Quick Reference: Coordinate Conversions'));
  console.log(pc.gray('  ' + '─'.repeat(50)));
  console.log();

  console.log(pc.cyan('  Position Conversion:'));
  console.log('    Unity ↔ Godot:  Flip Z axis');
  console.log('    Unity ↔ Unreal: Scale 100x (meters ↔ cm)');
  console.log();

  console.log(pc.cyan('  Rotation Conversion:'));
  console.log('    Unity ↔ Godot:  Negate Y and Z components');
  console.log('    Unity ↔ Unreal: Same handedness, verify axis');
  console.log();

  console.log(pc.cyan('  Precision Thresholds:'));
  console.log('    Safe:      < 1,000 units from origin');
  console.log('    Monitor:    1,000 - 5,000 units');
  console.log('    Warning:    5,000 - 10,000 units');
  console.log('    Critical:   > 10,000 units (use Floating Origin)');
  console.log();

  console.log(pc.cyan('  Common Commands:'));
  console.log('    forge coords convert "1,2,3" --from unity --to godot');
  console.log('    forge coords validate "10000,0,0" --engine unity');
  console.log('    forge coords engines');
  console.log();
}

async function handleBatch(file: string | undefined, options: BatchOptions): Promise<void> {
  const from = options.from.toLowerCase() as Engine;
  const to = options.to.toLowerCase() as Engine;

  if (!isValidEngine(from) || !isValidEngine(to)) {
    console.error(pc.red('Invalid engine specified'));
    process.exit(1);
  }

  const columns = options.columns.split(',').map((c) => parseInt(c, 10) - 1);
  if (columns.length !== 3 || columns.some(isNaN)) {
    console.error(pc.red('Invalid columns format. Use: "1,2,3" (1-based)'));
    process.exit(1);
  }

  // Read input
  let input: string;
  if (file) {
    const fs = await import('fs');
    input = fs.readFileSync(file, 'utf-8');
  } else {
    input = await new Promise((resolve) => {
      let data = '';
      process.stdin.on('data', (chunk) => (data += chunk));
      process.stdin.on('end', () => resolve(data));
    });
  }

  const lines = input.trim().split('\n');
  const results: { input: string; output: Vector3 }[] = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;

    const parts = line.split(/[,\t\s]+/);
    const x = parseFloat(parts[columns[0]]);
    const y = parseFloat(parts[columns[1]]);
    const z = parseFloat(parts[columns[2]]);

    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      const converted = convertPosition({ x, y, z }, from, to);
      results.push({
        input: `${x},${y},${z}`,
        output: converted,
      });
    }
  }

  // Output
  if (options.json) {
    for (const r of results) {
      console.log(JSON.stringify(buildEnvelope('coords.batch', {
        input: r.input,
        output: r.output,
      }, { ok: true })));
    }
  } else {
    console.log('# Converted coordinates:', `${from} → ${to}`);
    console.log('# input_x, input_y, input_z, output_x, output_y, output_z');
    for (const r of results) {
      console.log(`${r.input}, ${r.output.x}, ${r.output.y}, ${r.output.z}`);
    }
  }
}
