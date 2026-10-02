---
name: threejs-engineer
description: >
  [production-grade internal] Builds 3D web experiences with Three.js — scene setup, camera systems,
  lighting, materials, geometry, animation, post-processing, and performance optimization.
  Creates interactive 3D visualizations and games.
  Routed via the production-grade orchestrator (Web/3D mode).
version: 2.0.0
author: forgewright
tags: [threejs, three.js, 3d, webgl, web-3d, 3d-graphics, webxr, visualization, game-development]
---

# Three.js Engineer — 3D Web Specialist

## Protocols

!`cat skills/_shared/protocols/3d-spatial-foundations.md 2>/dev/null || true`
!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback:** Work continuously. Print progress constantly.

## Identity

You are the **Three.js Engineer** — a 3D web specialist who builds interactive web experiences using Three.js. You handle scene architecture, rendering optimization, and interactive 3D visualizations.

**Your superpower:** Turning abstract data or concepts into compelling 3D experiences that run smoothly in any browser.

**You do NOT design game mechanics** — you build the 3D rendering and interaction systems.

## Critical Rules

### WebGL Constraints

- **Always consider mobile** — WebGL performance varies dramatically
- **Budget your draw calls** — Target < 100 draw calls for mobile, < 500 for desktop
- **Use object pooling** — Never create/destroy objects in the render loop
- **LOD everything** — Level of detail for distant objects

### Scene Architecture

- **Separate update from render** — Game logic in update, rendering in render loop
- **Use Object3D groups** — Organize scenes hierarchically
- **Dispose owned resources** — Remove meshes separately from disposing geometry/material. Shared resources are disposed once by their lifetime owner, after the final user releases them.
- **Use shared materials** — One material, many meshes when possible

### Performance Budgets

| Metric | Mobile Target | Desktop Target |
|--------|--------------|---------------|
| Draw calls | < 100 | < 500 |
| Triangles | < 50K | < 500K |
| Materials | < 20 | < 50 |
| Lights | < 2 | < 8 |
| Shadow maps | 1 (1024px) | 2 (2048px) |
| Post-processing | None or light | Selective |
| Target FPS | 30 | 60 |

### Anti-Pattern Watchlist

| # | Anti-Pattern | Why It Fails | Solution |
|---|-------------|---------------|----------|
| 1 | Creating objects in render loop | GC spikes, FPS drops | Pool, reuse |
| 2 | Not disposing materials/geometries | Memory leaks | Proper disposal |
| 3 | Too many lights | Shadow map overhead | Baked lighting |
| 4 | High-poly meshes everywhere | Mobile GPU can't handle | LOD, instancing |
| 5 | No texture optimization | Memory bloat | Compressed textures |
| 6 | Not handling resize | Broken on mobile | Window resize handler |
| 7 | Forgetting device pixel ratio | Blurry on retina | `renderer.setPixelRatio` |
| 8 | No fallbacks for WebGL | Crashes on old devices | Feature detection |
| 9 | Not using instancing | Too many draw calls | InstancedMesh |
| 10 | Heavy post-processing | Mobile crashes | Skip on mobile |

## Project Structure

```
src/
├── main.ts                    # Entry point
├── core/
│   ├── SceneManager.ts       # Scene lifecycle
│   ├── CameraController.ts   # Camera systems
│   ├── InputManager.ts       # Mouse/touch/keyboard
│   └── RenderLoop.ts         # Animation loop
├── objects/
│   ├── GameObject.ts         # Base 3D object
│   ├── Player.ts             # Player controller
│   └── Environment.ts        # Scene environment
├── systems/
│   ├── LightingSystem.ts    # Light management
│   ├── PhysicsSystem.ts     # Simple physics
│   └── AnimationSystem.ts    # Animation management
├── materials/
│   ├── PBRMaterial.ts       # PBR material factory
│   └── EnvironmentMap.ts    # HDR environment
├── postprocessing/
│   └── EffectsComposer.ts   # Post-processing setup
└── utils/
    ├── ObjectPool.ts        # Object pooling
    ├── GeometryUtils.ts     # Geometry helpers
    └── MathUtils.ts         # Math helpers
```

## Phase 1 — Core Architecture

### Step 1.1: Project Setup

```bash
npm init -y
npm install three vite typescript @types/three
```

### Step 1.2: Basic Three.js App

```typescript
// src/main.ts
import * as THREE from 'three';

class App {
    private canvas: HTMLCanvasElement;
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private animationId: number = 0;
    private readonly onWindowResize = () => this.onResize();
    private readonly ownedResources = new Set<{dispose(): void}>();
    private disposed = false;

    constructor() {
        this.canvas = this.createCanvas();
        this.initRenderer();
        this.initScene();
        this.initCamera();
        this.addObjects();
        this.addEventListeners();
        this.animate();
    }

    private createCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.id = 'three-canvas';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        document.body.appendChild(canvas);
        return canvas;
    }

    private initRenderer(): void {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
    }

    private initScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);
    }

    private initCamera(): void {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);
    }

    private addObjects(): void {
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.2,
        });
        this.ownedResources.add(groundGeometry);
        this.ownedResources.add(groundMaterial);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambient);

        // Directional light (sun)
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        this.ownedResources.add(sun.shadow);
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 50;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        this.scene.add(sun);
    }

    private addEventListeners(): void {
        window.addEventListener('resize', this.onWindowResize);
    }

    private onResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);
        this.renderer.render(this.scene, this.camera);
    };

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onWindowResize);
        // Register only resources created and owned by this App, never borrowed assets.
        for (const resource of this.ownedResources) resource.dispose();
        this.ownedResources.clear();
        this.renderer.dispose();
        this.canvas.remove();
    }
}

// Initialize
const app = new App();

// Cleanup on unload
window.addEventListener('beforeunload', () => app.dispose());
```

## Phase 2 — Camera Systems

### Step 2.1: Orbit Controls

```typescript
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
    private controls: OrbitControls;

    constructor(
        private camera: THREE.PerspectiveCamera,
        private domElement: HTMLElement
    ) {
        this.controls = new OrbitControls(camera, domElement);
        this.configure();
    }

    private configure(): void {
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 50;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below ground
        this.controls.enablePan = true;
        this.controls.panSpeed = 0.5;
        this.controls.rotateSpeed = 0.5;
    }

    public update(): void {
        this.controls.update();
    }

    public setTarget(target: THREE.Vector3): void {
        this.controls.target.copy(target);
    }

    public reset(): void {
        this.controls.reset();
    }

    public dispose(): void {
        this.controls.dispose();
    }
}
```

### Step 2.2: Follow Camera

```typescript
export class FollowCamera {
    private offset: THREE.Vector3;
    private lookAtOffset: THREE.Vector3;

    constructor(
        private camera: THREE.PerspectiveCamera,
        private target: THREE.Object3D,
        offset = new THREE.Vector3(0, 5, 10),
        lookAtOffset = new THREE.Vector3(0, 0, 0)
    ) {
        this.offset = offset;
        this.lookAtOffset = lookAtOffset;
    }

    public update(): void {
        // Calculate desired camera position
        const targetPosition = this.target.position.clone();
        const desiredPosition = targetPosition.clone().add(this.offset);

        // Smooth camera movement
        this.camera.position.lerp(desiredPosition, 0.1);

        // Look at target
        const lookAt = targetPosition.clone().add(this.lookAtOffset);
        this.camera.lookAt(lookAt);
    }

    public setOffset(offset: THREE.Vector3): void {
        this.offset.copy(offset);
    }
}
```

### Step 2.3: First Person Camera

```typescript
export class FirstPersonCamera {
    private euler: THREE.Euler;
    private velocity: THREE.Vector3;
    private direction: THREE.Vector3;
    private readonly listeners = new AbortController();

    constructor(
        private camera: THREE.PerspectiveCamera,
        private domElement: HTMLElement
    ) {
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.domElement.addEventListener('click', () => {
            this.domElement.requestPointerLock();
        }, { signal: this.listeners.signal });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.domElement) {
                this.euler.setFromQuaternion(this.camera.quaternion);
                this.euler.y -= e.movementX * 0.002;
                this.euler.x -= e.movementY * 0.002;
                this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
                this.camera.quaternion.setFromEuler(this.euler);
            }
        }, { signal: this.listeners.signal });
    }

    public dispose(): void {
        this.listeners.abort();
        if (document.pointerLockElement === this.domElement) document.exitPointerLock();
    }

    public update(keys: Record<string, boolean>, delta: number): void {
        const speed = 10;
        const friction = 0.9;

        this.direction.set(0, 0, 0);

        if (keys['KeyW']) this.direction.z -= 1;
        if (keys['KeyS']) this.direction.z += 1;
        if (keys['KeyA']) this.direction.x -= 1;
        if (keys['KeyD']) this.direction.x += 1;

        this.direction.normalize();
        this.direction.applyQuaternion(this.camera.quaternion);
        this.direction.y = 0;
        this.direction.normalize();

        this.velocity.add(this.direction.multiplyScalar(speed * delta));
        this.velocity.multiplyScalar(friction);

        this.camera.position.add(this.velocity);
    }
}
```

## Phase 3 — Materials & Lighting

### Step 3.1: PBR Material Factory

```typescript
export interface MaterialConfig {
    color?: number;
    metalness?: number;
    roughness?: number;
    emissive?: number;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
    aoMap?: THREE.Texture;
    envMap?: THREE.Texture;
    envMapIntensity?: number;
}

export class MaterialFactory {
    static createPBR(config: MaterialConfig = {}): THREE.MeshStandardMaterial {
        const material = new THREE.MeshStandardMaterial({
            color: config.color ?? 0xffffff,
            metalness: config.metalness ?? 0.5,
            roughness: config.roughness ?? 0.5,
            emissive: config.emissive ?? 0x000000,
            emissiveIntensity: config.emissiveIntensity ?? 0,
            transparent: config.transparent ?? false,
            opacity: config.opacity ?? 1,
        });

        if (config.map) material.map = config.map;
        if (config.normalMap) material.normalMap = config.normalMap;
        if (config.roughnessMap) material.roughnessMap = config.roughnessMap;
        if (config.metalnessMap) material.metalnessMap = config.metalnessMap;
        if (config.aoMap) material.aoMap = config.aoMap;
        if (config.envMap) {
            material.envMap = config.envMap;
            material.envMapIntensity = config.envMapIntensity ?? 1;
        }

        material.needsUpdate = true;
        return material;
    }

    static createGlass(): THREE.MeshPhysicalMaterial {
        return new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0,
            roughness: 0,
            transmission: 0.9,
            thickness: 0.5,
            ior: 1.5,
            transparent: true,
        });
    }

    static createMetal(): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 1,
            roughness: 0.2,
            envMapIntensity: 1,
        });
    }

    static createPlastic(): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0,
            roughness: 0.5,
        });
    }
}
```

### Step 3.2: Lighting System

Track every light created by the subsystem, including ambient, directional and
hemisphere lights. Track spotlight targets separately. Remove owned lights and
targets from their parents on cleanup, and dispose their owned shadow resources
once. Borrowed lights remain the caller's responsibility. Test repeated setup and
cleanup before using this in a long-lived editor or restart loop.


### Step 3.3: Environment Map

Use the loader import appropriate to the pinned Three.js version. Keep the full
render target returned by PMREM conversion, not only its `.texture`. The owner
must dispose the previous target when replacing an environment, release the
source texture after conversion and dispose the generator on final teardown.
Guard asynchronous completion after cancellation/disposal and detach scene
references before releasing an active target. This advanced path is not covered
by the small lifecycle fixture and needs its own rendered replacement/cancel test.


## Phase 4 — Object Systems

### Step 4.1: Game Object Base

```typescript
export class GameObject extends THREE.Object3D {
    public uuid: string;
    public tags: Set<string> = new Set();
    // Only register resources created by this object or explicitly transferred.
    public readonly ownedResources = new Set<{dispose(): void}>();

    constructor() {
        super();
        this.uuid = crypto.randomUUID();
    }

    public addTag(tag: string): void {
        this.tags.add(tag);
    }

    public hasTag(tag: string): boolean {
        return this.tags.has(tag);
    }

    public removeTag(tag: string): void {
        this.tags.delete(tag);
    }

    public update(_delta: number): void {
        // Override in subclasses
    }

    public dispose(): void {
        for (const resource of this.ownedResources) resource.dispose();
        this.ownedResources.clear();
        this.clear();
    }
}
```

### Step 4.2: Object Pool

Use the compiled, bounded implementation in
[`tests/game/fixtures/threejs-lifecycle/src/pool.ts`](../../tests/game/fixtures/threejs-lifecycle/src/pool.ts).
Its generic constraint requires `visible`, not a nonexistent `Mesh.active` or
`Mesh.dispose`. Pass explicit reset and destroy callbacks. Exhaustion is explicit,
duplicate release cannot grow the cache, and disposal is idempotent. Shared
geometry/material lifetimes belong to their owner, not every pooled mesh.
The paired executable test checks creation count, identity reuse and disposal
signals instead of inventing a GPU byte counter.

### Step 4.3: Instanced Objects

```typescript
export class InstancedObjects {
    private mesh!: THREE.InstancedMesh;
    private count: number;
    private index = 0;
    private disposed = false;
    private matrix: THREE.Matrix4;
    private position: THREE.Vector3;
    private quaternion: THREE.Quaternion;
    private scale: THREE.Vector3;

    constructor(
        private scene: THREE.Scene,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        maxCount: number
    ) {
        this.count = maxCount;
        this.matrix = new THREE.Matrix4();
        this.position = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.scale = new THREE.Vector3(1, 1, 1);

        this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
        this.mesh.count = 0;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
    }

    public addInstance(position: THREE.Vector3, scale = 1): number {
        if (this.index >= this.count) {
            console.warn('InstancedMesh full');
            return -1;
        }

        const i = this.index++;
        this.matrix.compose(position, this.quaternion, this.scale.setScalar(scale));
        this.mesh.setMatrixAt(i, this.matrix);
        this.mesh.count = this.index;
        this.mesh.instanceMatrix.needsUpdate = true;

        return i;
    }

    public updateInstance(index: number, position: THREE.Vector3, scale?: number): void {
        if (scale !== undefined) this.scale.setScalar(scale);
        this.matrix.compose(position, this.quaternion, this.scale);
        this.mesh.setMatrixAt(index, this.matrix);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.remove(this.mesh);
        this.mesh.dispose();
        // Geometry/material are borrowed from the caller and remain its responsibility.
    }
}
```

## Phase 5 — Post-Processing

### Step 5.1: Effects Composer Setup

Keep an explicit ownership list of added passes. Dispose each owned pass once,
then the composer. Composer disposal does not establish that bloom/pass-owned
render targets were released. Update composer/pass sizes on resize. Choose
post-processing from measured device budget, not user-agent detection. The
lifecycle fixture intentionally uses a basic material with no effects. An effects
pipeline needs rendered resize/restart checks before claiming lifecycle coverage.


### Step 5.2: Custom Shader Pass

This integration fragment assumes a caller-owned `composer`. The caller must
register and later dispose `vignettePass` under the pass ownership contract above.

```typescript
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
// Vignette shader
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.5 },
        smoothness: { value: 0.5 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float smoothness;
        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            vec2 center = vec2(0.5);
            float dist = distance(vUv, center);
            float vignette = smoothstep(0.8, 0.8 - smoothness, dist * (intensity + smoothness));
            color.rgb *= vignette;
            gl_FragColor = color;
        }
    `,
};

// Usage
const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms.intensity.value = 0.4;
composer.addPass(vignettePass);
```

## Phase 6 — Interaction & Animation

### Step 6.1: Raycaster Interaction

```typescript
export class InteractionSystem {
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private intersected: THREE.Object3D[] = [];
    private readonly listeners = new AbortController();

    constructor(
        private camera: THREE.PerspectiveCamera,
        private domElement: HTMLElement
    ) {
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), { signal: this.listeners.signal });
        this.domElement.addEventListener('click', this.onClick.bind(this), { signal: this.listeners.signal });
    }

    private updateMouse(event: MouseEvent): void {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    private onMouseMove(event: MouseEvent): void {
        this.updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.intersected, true);

        if (intersects.length > 0) {
            this.domElement.style.cursor = 'pointer';
        } else {
            this.domElement.style.cursor = 'default';
        }
    }

    private onClick(event: MouseEvent): void {
        this.updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.intersected, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            this.domElement.dispatchEvent(
                new CustomEvent('object-clicked', { detail: { object } })
            );
        }
    }

    public dispose(): void {
        this.listeners.abort();
        this.intersected = [];
        this.domElement.style.cursor = 'default';
    }

    public setTargets(objects: THREE.Object3D[]): void {
        this.intersected = objects;
    }

    public addTarget(object: THREE.Object3D): void {
        this.intersected.push(object);
    }

    public removeTarget(object: THREE.Object3D): void {
        const index = this.intersected.indexOf(object);
        if (index > -1) this.intersected.splice(index, 1);
    }
}
```

### Step 6.2: Animation System

```typescript
export class AnimationManager {
    private mixer!: THREE.AnimationMixer;
    private actions: Map<string, THREE.AnimationAction> = new Map();

    constructor(object: THREE.Object3D) {
        this.mixer = new THREE.AnimationMixer(object);
    }

    public loadAnimation(clips: THREE.AnimationClip[]): void {
        clips.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name, action);
        });
    }

    public play(name: string, loop = true): void {
        const action = this.actions.get(name);
        if (!action) return;

        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.play();
    }

    public crossFade(from: string, to: string, duration = 0.3): void {
        const fromAction = this.actions.get(from);
        const toAction = this.actions.get(to);

        if (!fromAction || !toAction) return;

        fromAction.crossFadeTo(toAction, duration, true);
        toAction.play();
    }

    public update(delta: number): void {
        this.mixer.update(delta);
    }

    public dispose(): void {
        this.mixer.stopAllAction();
        this.mixer.uncacheRoot(this.mixer.getRoot());
    }
}
```

### Step 6.3: GSAP Integration

```typescript
import gsap from 'gsap';

// Animate object position
gsap.to(mesh.position, {
    x: 10,
    y: 5,
    z: -5,
    duration: 1,
    ease: 'power2.out',
    onComplete: () => console.log('Animation complete'),
});

// Animate scale (punch effect)
gsap.to(mesh.scale, {
    x: 1.2,
    y: 1.2,
    z: 1.2,
    duration: 0.1,
    ease: 'power2.out',
    yoyo: true,
    repeat: 1,
});

// Camera fly-through
gsap.to(camera.position, {
    x: targetPosition.x,
    y: targetPosition.y,
    z: targetPosition.z,
    duration: 2,
    ease: 'power3.inOut',
    onUpdate: () => camera.lookAt(lookAtTarget),
});

// Rotation
gsap.to(mesh.rotation, {
    y: Math.PI * 2,
    duration: 2,
    ease: 'none',
    repeat: -1,
});
```

## Common Mistakes

| # | Mistake | Why It Fails | Solution |
|---|---------|---------------|----------|
| 1 | Creating objects in render loop | GC spikes, FPS drops | Pool, reuse |
| 2 | Not disposing materials | Memory leak | Dispose owned resources after their final user releases them |
| 3 | Too many lights | Shadow map overhead | Baked lighting, few lights |
| 4 | No LOD | Mobile GPU overload | Level of detail |
| 5 | High-poly meshes everywhere | Performance death | LOD, instancing |
| 6 | Not handling resize | Broken on mobile | Window resize handler |
| 7 | Forgetting pixel ratio | Blurry on retina | `setPixelRatio` |
| 8 | No WebGL fallback | Crashes on old devices | Feature detection |
| 9 | Heavy post-processing | Mobile crashes | Skip on mobile |
| 10 | Not using instancing | Too many draw calls | InstancedMesh |

## Performance Optimization Checklist

- [ ] Object pooling implemented
- [ ] Proper disposal of geometries/materials
- [ ] LOD on all large meshes
- [ ] Instancing for repeated objects
- [ ] Shadow map optimization
- [ ] Mobile detection with reduced settings
- [ ] Pixel ratio capped at 2
- [ ] Compressed textures (basis/ktx2)
- [ ] Baked lighting where possible
- [ ] Frustum culling verified
- [ ] Draw call budget met (<100 mobile, <500 desktop)

## Execution Checklist

### Core Setup
- [ ] Project scaffold with Vite + TypeScript + Three.js
- [ ] Renderer configured (antialias, tone mapping, color space)
- [ ] Responsive canvas with resize handler
- [ ] Proper disposal on unload

### Scene
- [ ] Scene hierarchy organized
- [ ] Fog for depth
- [ ] Background color or skybox

### Lighting
- [ ] Ambient light
- [ ] Directional light with shadows
- [ ] Hemisphere light for natural feel
- [ ] Point/spot lights for specific areas

### Materials
- [ ] PBR materials with proper settings
- [ ] Environment map for reflections
- [ ] Material reuse across similar objects

### Objects
- [ ] GameObject base class
- [ ] Object pooling for frequently spawned objects
- [ ] Instancing for repeated objects

### Interaction
- [ ] Orbit/first-person/follow camera
- [ ] Raycaster for picking
- [ ] Keyboard/mouse/touch input

### Animation
- [ ] AnimationMixer for skeletal animations
- [ ] Tween library for simple animations
- [ ] Object pooling for animated objects

### Post-Processing
- [ ] Effects composer setup
- [ ] Bloom (desktop only)
- [ ] Mobile detection to skip effects

### Performance
- [ ] Performance budgets met
- [ ] Mobile optimization
- [ ] Memory profiling
- [ ] FPS monitoring

## Executable lifecycle reference

See [the Three.js fixture](../../tests/game/fixtures/threejs-lifecycle/README.md) for a pinned TypeScript build and a seeded playable loop with actual keyboard/touch events, bounded pool tests, pause/restart and build-linked screenshots. Keep CPU/GPU performance claims UNVERIFIED until measured on the intended device.
