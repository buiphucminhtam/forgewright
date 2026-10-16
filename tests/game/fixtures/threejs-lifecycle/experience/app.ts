import * as THREE from 'three';
import {Game, STEP} from '../src/model.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createGameUIKit} from '../../../../../templates/game/ui-kit/index.js';
import {bindPageLifecycle} from '../src/lifecycle.js';
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
let settingsOpen=false,resumeAfterSettings=false;
let motion=matchMedia('(prefers-reduced-motion: reduce)').matches?0:1;
let assetRoot:THREE.Object3D|undefined,mixer:THREE.AnimationMixer|undefined;
scene.add(new THREE.AmbientLight(0xffffff,2));
function disposeAsset(root:THREE.Object3D):void{
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
void new GLTFLoader().loadAsync('/assets/courier.glb').then(gltf=>{
 if(disposed){disposeAsset(gltf.scene);return;}
 assetRoot=gltf.scene;ship.add(assetRoot);material.visible=false;
 mixer=new THREE.AnimationMixer(assetRoot);for(const clip of gltf.animations)mixer.clipAction(clip).play();
 canvas.dataset.assetLoaded='true';canvas.dataset.assetClips=gltf.animations.map(c=>c.name).join(',');render();
}).catch(error=>{canvas.dataset.assetError=String(error);console.error(error);});
const kit=createGameUIKit(document.querySelector<HTMLElement>('#experience-ui')!,{tokens:{},actions:{onAction(id,value){
 if(id==='settings'){settingsOpen=true;resumeAfterSettings=game.phase==='playing';if(resumeAfterSettings)togglePause();}
 else if(id==='options'||id==='close-settings'){settingsOpen=false;if(resumeAfterSettings&&game.phase==='paused')togglePause();}
 else if(id==='motion')motion=Number(value);
 else if(id==='contrast')document.documentElement.dataset.contrast=String(value);
 renderKit();
}}});
function renderKit():void{kit.render(settingsOpen?{screen:'settings',modal:'options',components:[{id:'options',kind:'dialog',label:'Settings'},{id:'motion',kind:'slider',label:'Decorative motion',value:motion,min:0,max:1,step:.1},{id:'contrast',kind:'toggle',label:'High contrast',value:document.documentElement.dataset.contrast==='true'},{id:'close-settings',kind:'button',label:'Back to game'}]}:{screen:game.phase,components:[{id:'settings',kind:'button',label:'Settings'}]});}
renderKit();
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
  const elapsed=Math.min((now-last)/1000,.1);mixer?.update(elapsed*motion);
  accumulator += elapsed; last = now;
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
start.addEventListener('click', () => { if(settingsOpen)return;game.start(); run(); }, {signal: listeners.signal});
pause.addEventListener('click', () => {if(!settingsOpen)togglePause();}, {signal: listeners.signal});
for (const [id, direction] of [['left', -1], ['right', 1]] as const) {
  document.querySelector(`#${id}`)!.addEventListener('click', () => { if(settingsOpen)return;game.move(direction); render(); }, {signal: listeners.signal});
}
window.addEventListener('keydown', e => {
  if(settingsOpen)return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); game.move(e.key === 'ArrowLeft' ? -1 : 1); render();
  } else if (e.code === 'Space') { e.preventDefault(); togglePause(); }
}, {signal: listeners.signal});
window.addEventListener('resize', resize, {signal: listeners.signal});
window.addEventListener('blur', () => { if (game.phase === 'playing') togglePause(); }, {signal: listeners.signal});
function dispose(): void {
  if (disposed) return;
  disposed = true; listeners.abort(); cancelAnimationFrame(frame);kit.dispose();mixer?.stopAllAction();if(assetRoot){mixer?.uncacheRoot(assetRoot);disposeAsset(assetRoot);}
  geometry.dispose(); material.dispose(); gateGeometry.dispose(); gateMaterial.dispose();
  floorGeometry.dispose(); floorMaterial.dispose(); renderer.dispose();
}
bindPageLifecycle(window, () => { if (game.phase === 'playing') togglePause(); }, dispose, listeners.signal);
resize();
