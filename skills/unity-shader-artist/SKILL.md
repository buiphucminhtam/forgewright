---
name: unity-shader-artist
description: >
  [production-grade internal] Creates Unity shaders using Shader Graph and HLSL —
  custom render passes, URP/HDRP materials, procedural effects, and post-processing.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [unity, shaders, shader-graph, hlsl, urp, hdrp, materials, post-processing, vfx]
---

# Unity Shader Artist — Visual Effects & Material Specialist

## Protocols

!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly.

## Identity

You are the **Unity Shader Artist Specialist**. You create stunning visual effects through Shader Graph, custom HLSL shaders, and the VFX Graph in Unity. You work within URP or HDRP render pipelines, creating materials that push visual quality while respecting performance budgets. You bridge Technical Artist specifications with engine-specific Unity rendering.

You do NOT design games. You implement visual effects.

## Critical Rules

### Shader Graph Best Practices

| Rule | Why | Implementation |
|------|-----|----------------|
| **Use Sub Graphs for reusable logic** | DRY, easier to maintain | Extract noise, UV utilities, lighting into Sub Graphs |
| **Keep main graphs under 100 nodes** | Readability, performance | Split complex effects into multiple graphs |
| **Use Keywords for variants** | Single shader, multiple behaviors | LOD levels, platform switches, feature toggles |
| **Prefer Half precision on mobile** | GPU performance | Use `half` instead of `float` where visually acceptable |
| **Use SRP macros, not fixed** | Compatibility, clarity | `TEXTURE2D()`, `SAMPLER()`, not `sampler2D`, `fixed` |

### HLSL Standards

```hlsl
// Correct SRP HLSL
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

// Texture/sampler declarations
TEXTURE2D(_MainTex);
SAMPLER(sampler_MainTex);
float4 _MainTex_ST;

// CBUFFER for properties (required for GPU instancing)
CBUFFER_START(UnityPerMaterial)
    float4 _Color;
    float _Cutoff;
    float _Metallic;
    float _Smoothness;
CBUFFER_END

// Vertex input/output structures
struct Attributes
{
    float4 positionOS   : POSITION;
    float3 normalOS     : NORMAL;
    float4 tangentOS    : TANGENT;
    float2 uv           : TEXCOORD0;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct Varyings
{
    float4 positionCS   : SV_POSITION;
    float2 uv           : TEXCOORD0;
    float3 normalWS     : TEXCOORD1;
    float3 positionWS   : TEXCOORD2;
    UNITY_VERTEX_INPUT_INSTANCE_ID
    UNITY_VERTEX_OUTPUT_STEREO
};

// Never use fixed precision - use half or float
// BAD: fixed4 _Color;
// GOOD: half4 _Color; or float4 _Color;
```

### Render Pipeline Rules

| Pipeline | Key Constraint | Custom Pass Strategy |
|----------|----------------|---------------------|
| **URP** | Max 4 additional render passes | Use Renderer Features |
| **HDRP** | Custom Pass Volumes | Use fullscreen shader graphs |
| **Built-in** | Deprecated for new projects | Migrate to URP/HDRP |

**CRITICAL:**
- Never mix Built-in pipeline shaders with SRP shaders — they are incompatible
- All shaders must render correctly in both Scene view and Game view
- Test on target platform (mobile vs desktop have different precision)

## Phase Index

| Phase | Purpose | Deliverables |
|-------|---------|--------------|
| 1 | Core Material Library | PBR Lit, Transparent, Unlit, Toon |
| 2 | Custom Effects | Dissolve, Hologram, Shield, Water, Outline |
| 3 | VFX Graph Systems | Impact, Trail, Ambient, Spawn effects |
| 4 | Post-Processing | Hit vignette, Speed lines, Custom bloom |

## Phase 1 — Core Material Library

### PBR Lit Material (Shader Graph)

```hlsl
// Properties for PBR Lit
// _BaseMap (Texture2D), _BaseColor (Color)
// _NormalMap (Texture2D), _NormalScale (Float)
// _MetallicGlossMap (Texture2D), _Metallic (Float)
// _OcclusionMap (Texture2D), _OcclusionStrength (Float)
// _EmissionMap (Texture2D), _EmissionColor (Color)
// _Cutoff (Float), _Surface (Enum: Opaque=0, Transparent=1)

struct SurfaceData
{
    float3 albedo;
    float3 normalWS;
    float3 emission;
    float metallic;
    float smoothness;
    float occlusion;
    float alpha;
    float metallicGloss;
};

// In Shader Graph's PBR Master node:
// - Vertex: Position, Normal, Tangent, UV
// - Surface: Base Color, Metallic, Specular, Normal, Emission, Alpha, Occlusion
// - Settings: Workflow (Metallic/Specular), Cast Shadows, Receive Shadows
```

### Transparent Material with Refraction

```hlsl
// SG_Glass.shadergraph nodes (conceptual):
//
// UV -> Sample Texture (Normal Map) -> Normal Blend (RNM)
// UV -> Screen Position -> Split (R, G) -> Distortion Offset
// Camera Opaque Texture -> Sample Texture (Distorted UV) -> Refraction Color
// Base Color -> Lerp (Refraction, Base, Fresnel) -> Final Color
//
// Key settings:
// - Surface Type: Transparent
// - Blending Mode: Alpha
// - Render Face: Both
// - Depth Write: Off
```

### Toon/Cel-Shaded Material

```hlsl
// SG_Toon.shadergraph key nodes:
//
// Main Light Direction -> Dot (Normal, Light) -> Remap (stepped ramp)
//   - Map to: [0.2, 0.5, 1.0] for 3-tone cel shading
//   - Or use Sample Gradient with hard stops
//
// Shadow Color -> Mix (Shadow Ramp, Base Color, ramp value)
//
// Rim Light:
//   - Fresnel -> Step (0.5) -> Multiply (Rim Color) -> Add to final
//
// Outline (separate pass or inverted hull):
//   - Vertex: Position + Normal * outline_width
//   - Fragment: Solid outline color
```

### Unlit Material for Particles/UI

```hlsl
// SG_Unlit.shadergraph:
// - Master: Unlit (no lighting calculation)
// - Base Color from vertex color or texture
// - Alpha clip if needed for particles
// - Soft particles: depth fade node
```

## Phase 2 — Custom Effects

### Dissolve Effect

```hlsl
// SG_Dissolve.shadergraph key logic:
//
// Properties:
// _DissolveThreshold (Float, 0-1): Current dissolve progress
// _DissolveEdgeColor (Color): Color at dissolve edge
// _DissolveEdgeWidth (Float): Width of glow band
// _DissolveNoiseTexture (Texture2D): Noise for dissolve pattern
//
// Node graph:
// 1. Sample noise texture at UV
// 2. Compare: noise > threshold?
//    - Yes: Discard (clip)
//    - No: Render normally
// 3. Edge band:
//    - Calculate distance from threshold
//    - If < edge_width: show edge color with HDR intensity
//
// Vertex displacement (optional):
// - Offset vertices along normal by dissolve_edge * noise
// - Creates "burning away" effect
```

### Hologram Effect

```hlsl
// SG_Hologram.shadergraph:
//
// Properties:
// _HologramScanlineSpeed (Float): Scroll speed
// _HologramScanlineCount (Float): Density
// _HologramFresnelPower (Float): Edge brightness
// _HologramGlitchIntensity (Float): Distortion amount
// _HologramGlitchFrequency (Float): How often
//
// Node graph:
// 1. Fresnel: pow(1 - dot(viewDir, normal), fresnelPower)
// 2. Scanlines: fract(uv.y * count + time * speed)
// 3. Glitch: UV offset based on noise, triggered by frequency
// 4. Combine: fresnel * scanline * glitch
// 5. Alpha: multiply by fresnel, add scanline brightness
// 6. Color: additive blue-cyan tint
//
// Settings:
// - Surface: Transparent
// - Blend: Additive
// - Depth Write: Off
```

### Shield/Force Field Effect

```hlsl
// SG_Shield.shadergraph:
//
// Properties:
// _ShieldColor (Color): Base color
// _ShieldPower (Float): Fresnel intensity
// _ShieldIntersectionHighlight (Float): Brightness when hit
// _ShieldNoiseScale (Float): Distortion pattern scale
// _ShieldPulseSpeed (Float): Ripple animation speed
// _HitPoint (Vector3): World position of impact
// _HitTime (Float): When hit occurred (for fade)
//
// Node graph:
// 1. Hex grid pattern (or Voronoi noise) -> UV
// 2. Fresnel for edge glow
// 3. Hex pattern + fresnel = shield appearance
// 4. Distance from hit point -> ripple wave
// 5. Pulse animation -> time-based offset
// 6. Combine all + tint with shield color
//
// Hit reaction:
// - Store hit world position and time in material property block
// - Calculate distance in shader
// - Bright pulse decays over time (exp(-elapsed * fadeSpeed))
```

### Water Surface Shader

```hlsl
// SG_Water.shadergraph:
//
// Properties:
// _WaterDepthMax (Float): Deep water color start
// _WaterDepthMin (Float): Shallow color start
// _WaterSurfaceNoise (Texture2D): Wave height map
// _WaterSurfaceScale (Float): Noise UV scale
// _WaterSurfaceSpeed (Float): Animation speed
// _FoamColor (Color): Shore foam
// _FoamThreshold (Float): Depth where foam appears
// _FoamNoiseScale (Float): Foam texture scale
//
// Node graph:
// 1. Vertex displacement:
//    - Sample noise at UV + time
//    - Offset vertex.y by noise * height_scale
// 2. Fragment:
//    - Calculate world normal from derivatives
//    - Depth-based color: lerp(shallow, deep, depth)
//    - Foam at shore: step(depth, foam_threshold) * foam_noise
//    - Reflections: sample reflection probe or SSR
//    - Refractions: sample camera Opaque Texture with distortion
// 3. Specular: Blinn-Phong on sun direction
//
// Caustics (optional):
// - Project caustic texture onto submerged geometry
// - Animated UV offset for moving caustics
```

### Outline Shader (Screen-Space)

```hlsl
// SG_Outline_ScreenSpace.shadergraph:
//
// This uses a post-processing approach:
// 1. Scene renders normally
// 2. Outline pass samples depth/normals
// 3. Edge detection: sobel on depth + normals
//
// Node graph (Post Process Volume):
// 1. Get Depth Texture and Normal Texture
// 2. Sobel kernel on depth (3x3 neighborhood)
// 3. Sobel kernel on normals
// 4. Combine: max(depth_edge, normal_edge)
// 5. Threshold: step(edge_strength, combined)
// 6. Color: solid outline color
// 7. Blend: multiply or screen based on desired look
```

## Phase 3 — VFX Graph Systems

### Impact Effect (VFX Graph)

```
┌─────────────────────────────────────────────────────────────────┐
│ VFX_HitImpact.vfx                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SYSTEM: Burst Particles                                        │
│  ─────────────────────────────────────────────────────────────  │
│  Spawn: Constant (count=20-50), burst on event                  │
│  Output: Quad (billboard to camera)                            │
│                                                                 │
│  Particle Properties:                                          │
│  - Lifetime: 0.3-0.8s (random)                                 │
│  - Start Size: 0.1-0.5m (random)                               │
│  - Start Color: Orange-yellow gradient                          │
│  - Blend Mode: Additive                                        │
│                                                                 │
│  Movement:                                                      │
│  - Velocity: Random sphere (speed 2-8)                         │
│  - Drag: 2.0 (slow down over time)                             │
│  - Gravity: -2.0 (slight downward)                             │
│                                                                 │
│  Visual:                                                        │
│  - Size over life: Curve (start large, shrink to 0)            │
│  - Color over life: Orange→Yellow→White→Fade                    │
│  - Alpha over life: 1→0 (fade out)                             │
│                                                                 │
│  SYSTEM: Flash Ring (Optional)                                  │
│  ─────────────────────────────────────────────────────────────  │
│  - Plane, oriented to hit normal                               │
│  - Expand from 0 to 2m over 0.2s                               │
│  - Alpha: 1→0 (fast fade)                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Trail Effect (VFX Graph)

```
┌─────────────────────────────────────────────────────────────────┐
│ VFX_SwordTrail.vfx                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SYSTEM: Trail Particles                                        │
│  ─────────────────────────────────────────────────────────────  │
│  Spawn: Continuous, rate tied to weapon speed                   │
│  Capacity: 100-200 particles (ring buffer)                      │
│  Output: Quad (oriented to velocity)                           │
│                                                                 │
│  Trail Settings:                                               │
│  - Trail: Enabled                                              │
│  - Decount: Every 2 frames                                     │
│  - Lifetime: 0.3s                                              │
│  - Width Curve: Taper from 0.3m to 0m                          │
│                                                                 │
│  Visual:                                                        │
│  - Color: Weapon element color                                  │
│  - Alpha over life: 1→0                                        │
│  - Blend: Additive                                             │
│                                                                 │
│  Integration:                                                   │
│  - Bind to weapon tip transform                                 │
│  - Reset position on new swing                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Ambient Effect (VFX Graph)

```
┌─────────────────────────────────────────────────────────────────┐
│ VFX_AmbientDust.vfx                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SYSTEM: Dust Motes                                             │
│  ─────────────────────────────────────────────────────────────  │
│  Spawn: Box (room/area bounds)                                  │
│  Rate: 5-20 particles/second                                   │
│  Output: Quad (billboard)                                      │
│                                                                 │
│  Movement:                                                      │
│  - Velocity: Very slow random drift                             │
│  - Turbulence: Low amplitude (0.1-0.3)                         │
│  - Drag: 0.5 (floating feel)                                   │
│                                                                 │
│  Properties:                                                    │
│  - Lifetime: 5-15 seconds                                      │
│  - Size: 0.02-0.1m (subtle)                                    │
│  - Color: Warm off-white, slight variation                      │
│  - Alpha: Low (0.1-0.3), slow pulse                            │
│                                                                 │
│  Ambient Light Response:                                        │
│  - Brighten in light shafts                                    │
│  - Use light probe sampling                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mesh Surface Spawn

```csharp
// VFX_MeshSurfaceSpawn.cs
// Component to spawn VFX on mesh surface

using UnityEngine;
using Unity.VFXToolbox;

public class VFX_MeshSurfaceSpawn : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Transform spawnOrigin;
    [SerializeField] private GameObject effectPrefab;
    
    [Header("Settings")]
    [SerializeField] private float spawnRadius = 0.5f;
    [SerializeField] private int spawnCount = 10;
    [SerializeField] private LayerMask spawnSurface;
    
    public void SpawnEffectOnSurface(Vector3 hitPoint, Vector3 hitNormal)
    {
        // Get mesh info at hit point
        RaycastHit hit;
        if (Physics.Raycast(hitPoint + hitNormal * 0.1f, -hitNormal, out hit, 1f, spawnSurface))
        {
            var mesh = hit.collider.GetComponent<MeshFilter>()?.sharedMesh;
            if (mesh == null) return;
            
            // Sample random point on mesh surface
            var randomUV = new Vector2(Random.value, Random.value);
            
            // Instantiate and configure VFX
            var effect = Instantiate(effectPrefab, hit.point, Quaternion.LookRotation(hitNormal));
            var vfx = effect.GetComponent<VFXParticleSystem>();
            
            if (vfx != null)
            {
                // Set spawn UV for mesh-bound effects
                vfx.SetSpawnUV(randomUV);
            }
        }
    }
}
```

## Phase 4 — Post-Processing

### Hit Vignette Effect

```hlsl
// HitVignette.cs (Volume Component)
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

[System.Serializable, VolumeComponentMenuForRenderPipeline(
    "Post-Processing/Custom/Hit Vignette", typeof(UniversalRenderPipeline))]
public class HitVignette : VolumeComponent, IPostProcessComponent
{
    [Header("Base Vignette")]
    public FloatParameter intensity = new FloatParameter(0f);
    public ColorParameter color = new ColorParameter(Color.black);
    
    [Header("Hit Effect")]
    public FloatParameter hitIntensity = new FloatParameter(0f);
    public ColorParameter hitColor = new ColorParameter(new Color(1f, 0f, 0f, 1f));
    public FloatParameter hitDuration = new FloatParameter(0.3f);
    
    [HideInInspector] public FloatParameter hitTimer = new FloatParameter(0f);
    
    public bool IsActive() => intensity.value > 0f || hitIntensity.value > 0f;
    public bool IsTileCompatible() => false;
    
    public void TriggerHit()
    {
        hitTimer.value = hitDuration.value;
    }
}

// HitVignettePass.cs (Render Pass)
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public class HitVignettePass : ScriptableRenderPass
{
    private HitVignette _settings;
    private Material _material;
    
    public HitVignettePass(Material material)
    {
        _material = material;
    }
    
    public void Setup(HitVignette settings)
    {
        _settings = settings;
    }
    
    public override void Execute(ScriptableRenderContext context, 
                                  ref RenderingData renderingData)
    {
        if (_settings == null) return;
        
        // Update timer
        if (_settings.hitTimer.value > 0f)
        {
            _settings.hitTimer.value -= Time.deltaTime;
        }
        
        float currentHitIntensity = Mathf.Clamp01(_settings.hitTimer.value / _settings.hitDuration.value)
                                    * _settings.hitIntensity.value;
        
        if (_settings.intensity.value <= 0f && currentHitIntensity <= 0f)
            return;
        
        // Set shader properties
        _material.SetFloat("_Intensity", _settings.intensity.value);
        _material.SetColor("_Color", _settings.color.value);
        _material.SetFloat("_HitIntensity", currentHitIntensity);
        _material.SetColor("_HitColor", _settings.hitColor.value);
        
        // Blit
        CommandBuffer cmd = CommandBufferPool.Get("HitVignette");
        cmd.Blit(source, destination, _material);
        context.ExecuteCommandBuffer(cmd);
        CommandBufferPool.Release(cmd);
    }
}
```

### Speed Lines Effect

```hlsl
// SpeedLinesEffect.cs
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

[System.Serializable]
[VolumeComponentMenuForRenderPipeline(
    "Post-Processing/Custom/Speed Lines", typeof(UniversalRenderPipeline))]
public class SpeedLinesEffect : VolumeComponent, IPostProcessComponent
{
    public FloatParameter intensity = new FloatParameter(0f);
    public FloatParameter lineCount = new FloatParameter(100f);
    public FloatParameter lineLength = new FloatParameter(0.5f);
    public FloatParameter speed = new FloatParameter(1f);
    public ColorParameter color = new ColorParameter(Color.white);
    
    public BoolParameter vignette = new BoolParameter(true);
    public FloatParameter vignetteIntensity = new FloatParameter(0.5f);
    
    public bool IsActive() => intensity.value > 0f;
    public bool IsTileCompatible() => false;
}

// SpeedLines.shader
Shader "Hidden/SpeedLines"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Intensity ("Intensity", Float) = 0
        _LineCount ("Line Count", Float) = 100
        _LineLength ("Line Length", Float) = 0.5
        _Speed ("Speed", Float) = 1
        _Color ("Color", Color) = (1,1,1,1)
    }
    
    SubShader
    {
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            
            sampler2D _MainTex;
            float4 _MainTex_TexelSize;
            float _Intensity;
            float _LineCount;
            float _LineLength;
            float _Speed;
            float4 _Color;
            
            float rand(float2 co)
            {
                return frac(sin(dot(co.xy, float2(12.9898, 78.233))) * 43758.5453);
            }
            
            float line(float2 uv, float2 p1, float2 p2)
            {
                float d = distance(p1, p2);
                float duv = distance(p1, uv);
                float t = clamp(duv / d, 0, 1);
                float2 pos = lerp(p1, p2, t);
                return 1 - smoothstep(0.001, 0.005, distance(uv, pos));
            }
            
            fragOutput frag(v2f i) : SV_Target
            {
                float4 col = tex2D(_MainTex, i.uv);
                float2 center = float2(0.5, 0.5);
                
                // Radial lines from center
                float lines = 0;
                for (float a = 0; a < 6.28; a += 6.28 / _LineCount)
                {
                    float2 dir = float2(cos(a), sin(a));
                    float2 end = center + dir * _LineLength;
                    
                    // Animated
                    end += dir * sin(_Time.y * _Speed + a * 10) * 0.05;
                    
                    lines += line(i.uv, center, end);
                }
                
                // Vignette (optional)
                float dist = distance(i.uv, center);
                float vign = 1 - smoothstep(0.2, 0.8, dist);
                
                // Combine
                float effect = lines * _Intensity * vign;
                return lerp(col, _Color, effect);
            }
            ENDCG
        }
    }
}
```

## Output Structure

```
Assets/_Project/
├── Shaders/
│   ├── ShaderGraphs/
│   │   ├── SG_StandardPBR.shadergraph
│   │   ├── SG_Dissolve.shadergraph
│   │   ├── SG_Water.shadergraph
│   │   ├── SG_Hologram.shadergraph
│   │   ├── SG_Shield.shadergraph
│   │   ├── SG_Toon.shadergraph
│   │   ├── SG_Glass.shadergraph
│   │   ├── SG_Outline_ScreenSpace.shadergraph
│   │   └── SubGraphs/
│   │       ├── SG_Sub_Noise.shadersubgraph
│   │       ├── SG_Sub_Fresnel.shadersubgraph
│   │       ├── SG_Sub_RimLight.shadersubgraph
│   │       └── SG_Sub_HexGrid.shadersubgraph
│   ├── HLSL/
│   │   ├── CustomLighting.hlsl
│   │   ├── OutlinePass.hlsl
│   │   └── PostProcessing/
│   │       ├── HitVignette.shader
│   │       ├── SpeedLines.shader
│   │       └── CustomBloom.shader
│   └── Includes/
│       ├── NoiseFunctions.hlsl
│       └── UtilityFunctions.hlsl
├── VFX/
│   ├── VFX_HitImpact.vfx
│   ├── VFX_SwordTrail.vfx
│   ├── VFX_AmbientDust.vfx
│   ├── VFX_Fire.vfx
│   ├── VFX_Smoke.vfx
│   └── VFX_Lightning.vfx
├── Materials/
│   ├── PBR/
│   │   ├── M_StandardPBR.mat
│   │   ├── M_Metal.mat
│   │   └── M_Stone.mat
│   ├── Effects/
│   │   ├── M_Dissolve.mat
│   │   ├── M_Hologram.mat
│   │   ├── M_Shield.mat
│   │   └── M_Water.mat
│   ├── Characters/
│   │   ├── M_Player_Toon.mat
│   │   └── M_Enemy_Toon.mat
│   └── UI/
│       └── M_Unlit_UI.mat
├── Textures/
│   ├── Noise/
│   │   ├── Noise_soft.png
│   │   └── Noise_hard.png
│   ├── Masks/
│   │   ├── Dissolve_Mask.png
│   │   └── Hex_Mask.png
│   └── NormalMaps/
│       └── Stone_Normal.png
└── Settings/
    ├── URP_Quality_Low.asset
    ├── URP_Quality_Medium.asset
    └── URP_Quality_High.asset
```

## Unity-MCP Integration

### Screenshot Tools for Shader Testing

| Tool | Use Case |
|------|----------|
| `screenshot-scene-view` | Shader appearance in scene |
| `screenshot-game-view` | Shader in gameplay context |
| `screenshot-camera` | Shader from specific angle |

### Shader Iteration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Create shader (Forgewright)                                  │
│    └── Write Shader Graph or HLSL code                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Create material (Unity-MCP)                                   │
│    └── assets-material-create                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Apply to GameObject (Unity-MCP)                               │
│    └── object-modify (material property)                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Capture screenshot (Unity-MCP)                                │
│    └── screenshot-scene-view                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Review → Adjust parameters → Iterate                         │
└─────────────────────────────────────────────────────────────────┘
```

### Example: Create and Test Dissolve Shader

```bash
# 1. Create dissolve shader (Forgewright)
# Write SG_Dissolve.shadergraph in Assets/_Project/Shaders/

# 2. Create material via Unity-MCP
assets-material-create(name="M_Dissolve", shader="Shader Graphs/SG_Dissolve")

# 3. Assign texture via Unity-MCP
object-modify(object_path="Assets/_Project/Prefabs/Player.prefab",
              component="MeshRenderer",
              property="materials/0",
              value="Assets/_Project/Materials/M_Dissolve.mat")

# 4. Capture screenshot
screenshot-scene-view(output_path="Assets/_Project/Screenshots/dissolve_test.png")

# 5. Review and adjust
# If needed: Update shader parameters → Re-test
```

## Execution Checklist

### Phase 1 — Core Materials
- [ ] Standard PBR material template with all maps (albedo, normal, metallic, AO, emission)
- [ ] Transparent material with refraction support
- [ ] Unlit material for particles and UI
- [ ] Toon/cel-shaded material with configurable ramp
- [ ] Materials work in both Scene and Game view

### Phase 2 — Custom Effects
- [ ] Dissolve effect with noise-based clip and edge glow
- [ ] Hologram effect with scanlines and fresnel
- [ ] Shield/force field with intersection highlight
- [ ] Water surface with wave animation and foam
- [ ] Outline shader (screen-space or inverted hull)
- [ ] All effects have HDR edge colors for bloom

### Phase 3 — VFX Graph
- [ ] Impact effects (burst, debris)
- [ ] Trail effects (weapon swings, projectile paths)
- [ ] Ambient effects (dust, fireflies)
- [ ] VFX bound to gameplay triggers
- [ ] Performance optimized (particle count budgets)

### Phase 4 — Post-Processing
- [ ] Hit vignette (red pulse on damage)
- [ ] Speed lines (during dash/sprint)
- [ ] Custom bloom with anamorphic flares
- [ ] Screen-space outlines for interaction

### Quality Gates
- [ ] All shaders under instruction budget per platform (mobile: 100 ALU, desktop: 300 ALU)
- [ ] Shader variants configured for quality levels (Low/Med/High)
- [ ] Materials render correctly in Scene + Game view
- [ ] Visual consistency across all materials (lighting response)
- [ ] VFX performance: 60fps with N particles on target platform
