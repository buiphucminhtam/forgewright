import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {after, test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as THREE from 'three';

// Execute the shipped Markdown class, not a second camera implementation.
const root = fileURLToPath(new URL('.', import.meta.url));
const markdown = readFileSync(new URL('../../../../skills/threejs-engineer/SKILL.md', import.meta.url), 'utf8');
const block = [...markdown.matchAll(/```typescript\n([\s\S]*?)```/g)]
  .map(match => match[1]).find(code => code.includes('class FollowCamera {'));
assert.ok(block, 'FollowCamera example must be present');
const directory = mkdtempSync(join(root, '.skill-check-'));
after(() => rmSync(directory, {recursive: true, force: true}));
let FollowCamera;
try {
  const source = join(directory, 'follow-camera.ts');
  writeFileSync(source, "import * as THREE from 'three';\n" + block);
  const compile = spawnSync(process.execPath, [
    fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url)),
    '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ES2022',
    '--lib', 'ES2022,DOM', '--outDir', join(directory, 'out'), source,
  ], {encoding: 'utf8', timeout: 30000});
  assert.ifError(compile.error);
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  ({FollowCamera} = await import(pathToFileURL(join(directory, 'out/follow-camera.js')).href));
} catch (error) {
  rmSync(directory, {recursive: true, force: true});
  throw error;
}

function setup(lambda = 5) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-8, 6, 20);
  const target = new THREE.Object3D();
  target.position.set(3, 0, -7);
  const offset = new THREE.Vector3(0, 5, 10);
  const lookAtOffset = new THREE.Vector3(0, 1, 0);
  return {camera, target, offset, lookAtOffset,
    follow: new FollowCamera(camera, target, offset, lookAtOffset, lambda)};
}

test('stationary-target follow reaches the same pose at equal elapsed time across refresh rates', () => {
  // Numerical tolerance for this small fixture, not a player-feel threshold.
  const tolerance = 1e-10;
  const positions = [30, 60, 120].map(hz => {
    const {camera, target, offset, follow} = setup();
    const start = camera.position.clone();
    const desired = target.position.clone().add(offset);
    const initialError = start.distanceTo(desired);
    for (let frame = 0; frame < hz / 5; frame++) follow.update(1 / hz);
    const remaining = camera.position.distanceTo(desired);
    assert.ok(remaining > initialError * 0.1 && remaining < initialError * 0.9,
      'sample an in-progress approach; a snap or already-converged pose hides timebase defects');
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(camera.position[axis] >= Math.min(start[axis], desired[axis]) - tolerance);
      assert.ok(camera.position[axis] <= Math.max(start[axis], desired[axis]) + tolerance);
    }
    return camera.position.clone();
  });
  assert.ok(positions[0].distanceTo(positions[1]) < tolerance, '30/60Hz pose mismatch');
  assert.ok(positions[1].distanceTo(positions[2]) < tolerance, '60/120Hz pose mismatch');
});

test('zero elapsed time and zero follow rate preserve camera position', () => {
  const paused = setup();
  const initial = paused.camera.position.clone();
  paused.follow.update(0);
  assert.deepEqual(paused.camera.position.toArray(), initial.toArray());
  const disabled = setup(0);
  disabled.follow.update(0.2);
  assert.deepEqual(disabled.camera.position.toArray(), initial.toArray());
});

test('retargeting and setOffset keep the existing desired-position and look-at meanings', () => {
  const {camera, target, lookAtOffset, follow} = setup();
  const nextOffset = new THREE.Vector3(-2, 3, 4);
  follow.setOffset(nextOffset);
  nextOffset.set(100, 100, 100); // Setter copies; caller mutation does not retune it.
  target.position.set(-10, -4, 6);
  for (let frame = 0; frame < 240; frame++) follow.update(1 / 60);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(-12, -1, 10)) < 1e-6);
  const expectedDirection = target.position.clone().add(lookAtOffset).sub(camera.position).normalize();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(expectedDirection) < 1e-10);
});
