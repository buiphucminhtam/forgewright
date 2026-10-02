import * as THREE from 'three';
import {Game, STEP} from './model.js';
import {bindPageLifecycle} from './lifecycle.js';
const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const state = document.querySelector<HTMLElement>('#state')!;
const score = document.querySelector<HTMLElement>('#score')!;
const next = document.querySelector<HTMLElement>('#next')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const build = await fetch('/build.json').then(r => r.json()) as {hash: string};
document.querySelector('#build')!.textContent = build.hash.slice(0, 12);
const game = new Game(7);
const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'low-power'});
renderer.setPixelRatio(1);
renderer.setClearColor(0x081524);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 50);
camera.position.set(0, 6.5, 9); camera.lookAt(0, 0, -2);
const geometry = new THREE.BoxGeometry(0.7, 0.35, 1);
const material = new THREE.MeshBasicMaterial({color: 0xffd44d});
const ship = new THREE.Mesh(geometry, material); scene.add(ship);
const gateGeometry = new THREE.BoxGeometry(1.25, 0.8, 0.3);
const gateMaterial = new THREE.MeshBasicMaterial({color: 0xf06b68});
const gates = Array.from({length: 2}, () => { const m = new THREE.Mesh(gateGeometry, gateMaterial); scene.add(m); return m; });
const floorGeometry = new THREE.PlaneGeometry(5, 16);
const floorMaterial = new THREE.MeshBasicMaterial({color: 0x173c50, side: THREE.DoubleSide});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.25, -3); scene.add(floor);
let frame = 0, last = 0, accumulator = 0, disposed = false;
const listeners = new AbortController();
function render(): void {
  ship.position.x = (game.lane - 1) * 1.5;
  const safe = game.route[Math.min(game.score, 2)];
  const blocked = [0, 1, 2].filter(lane => lane !== safe);
  gates.forEach((gate, index) => {
    gate.position.set((blocked[index] - 1) * 1.5, 0, -7 + (game.ticks % 120) / 120 * 7);
    gate.visible = game.phase !== 'won';
  });
  state.textContent = game.phase; score.textContent = `${game.score} / 3`;
  next.textContent = ['LEFT', 'CENTRE', 'RIGHT'][safe];
  pause.textContent = game.phase === 'paused' ? 'Resume' : 'Pause';
  pause.disabled = !['playing', 'paused'].includes(game.phase);
  canvas.dataset.phase = game.phase;
  canvas.dataset.lane = String(game.lane);
  canvas.dataset.ticks = String(game.ticks);
  renderer.render(scene, camera);
}
function animate(now: number): void {
  frame = 0;
  if (disposed || game.phase !== 'playing') return;
  accumulator += Math.min((now - last) / 1000, 0.1); last = now;
  while (accumulator >= STEP) { game.step(); accumulator -= STEP; }
  render();
  if (game.phase === 'playing') frame = requestAnimationFrame(animate);
}
function run(): void {
  cancelAnimationFrame(frame); accumulator = 0; last = performance.now();
  render(); frame = requestAnimationFrame(animate);
}
function togglePause(): void {
  if (game.phase === 'playing') { game.pause(); cancelAnimationFrame(frame); frame = 0; render(); }
  else if (game.phase === 'paused') { game.resume(); run(); }
}
function resize(): void {
  const {width, height} = canvas.getBoundingClientRect();
  camera.aspect = width / height; camera.updateProjectionMatrix();
  renderer.setSize(width, height, false); render();
}
start.addEventListener('click', () => { game.start(); run(); }, {signal: listeners.signal});
pause.addEventListener('click', togglePause, {signal: listeners.signal});
for (const [id, direction] of [['left', -1], ['right', 1]] as const) {
  document.querySelector(`#${id}`)!.addEventListener('click', () => { game.move(direction); render(); }, {signal: listeners.signal});
}
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); game.move(e.key === 'ArrowLeft' ? -1 : 1); render();
  } else if (e.code === 'Space') { e.preventDefault(); togglePause(); }
}, {signal: listeners.signal});
window.addEventListener('resize', resize, {signal: listeners.signal});
window.addEventListener('blur', () => { if (game.phase === 'playing') togglePause(); }, {signal: listeners.signal});
function dispose(): void {
  if (disposed) return;
  disposed = true; listeners.abort(); cancelAnimationFrame(frame);
  geometry.dispose(); material.dispose(); gateGeometry.dispose(); gateMaterial.dispose();
  floorGeometry.dispose(); floorMaterial.dispose(); renderer.dispose();
}
bindPageLifecycle(window, () => { if (game.phase === 'playing') togglePause(); }, dispose, listeners.signal);
resize();
